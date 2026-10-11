import { AssetProps, ContentTypeProps, CreateEntryProps, EntryProps } from 'contentful-management';
import { CMAClient } from '@contentful/app-sdk';
import { AppParameters } from '@/vite-env';

type ReferenceMap = Record<string, EntryProps>;
type ReferenceChildrenMap = Record<string, string[]>;
type ClonedAssetIdMap = Record<string, string | null>;

// Image Focal Point coordinates are relative to the linked image, so they are stale once it is removed
const FOCAL_POINT_FIELD_ID = 'focalPoint';
const ASSET_PROCESSING_OPTIONS = { processingCheckWait: 2000, processingCheckRetries: 15 };

export type CloneReferenceNode = {
  entryId: string;
  label: string;
  children: CloneReferenceNode[];
};

export type CloneReferenceEntry = {
  entryId: string;
  label: string;
  contentTypeId: string;
  depth: number;
  referencedByCount: number;
  parentEntryId: string | null;
  childEntryIds: string[];
};

export class ReferenceDiscoveryAbortedError extends Error {
  constructor() {
    super('Reference discovery was cancelled');
    this.name = 'ReferenceDiscoveryAbortedError';
  }
}

class EntryCloner {
  private references: ReferenceMap = {};
  private clones: ReferenceMap = {};
  private failedCloneIds: string[] = [];
  private failedUpdateIds: string[] = [];
  private assetClones: Record<string, Promise<string | null>> = {};
  private removedAssetLinkCount: number = 0;
  private referenceChildren: ReferenceChildrenMap = {};
  private discoveryOrder: string[] = [];
  private discoveryDepths: Record<string, number> = {};
  private discoveryParents: Record<string, string | null> = {};
  private contentTypes: { [id: string]: ContentTypeProps } = {};
  private updates: number = 0;
  private parameters: AppParameters;
  private cma: CMAClient;
  private entryId: string;
  private setReferencesCount: (count: number) => void;
  private setClonesCount: (count: number) => void;
  private setUpdatesCount: (count: number) => void;

  constructor(
    cma: CMAClient,
    parameters: AppParameters,
    entryId: string,
    setReferencesCount: (count: number) => void,
    setClonesCount: (count: number) => void,
    setUpdatesCount: (count: number) => void
  ) {
    this.cma = cma;
    this.parameters = parameters;
    this.entryId = entryId;
    this.setReferencesCount = setReferencesCount;
    this.setClonesCount = setClonesCount;
    this.setUpdatesCount = setUpdatesCount;
  }

  async cloneEntry(selectedEntryIds?: string[]): Promise<EntryProps> {
    if (Object.keys(this.references).length === 0) {
      await this.findReferences(this.entryId);
    }
    if (selectedEntryIds) {
      this.filterReferences(selectedEntryIds);
      this.setReferencesCount(Object.keys(this.references).length);
    }
    await this.createClones();
    if (this.failedCloneIds.length > 0) {
      throw new Error(
        `Failed to clone ${this.failedCloneIds.length} ${
          this.failedCloneIds.length === 1 ? 'entry' : 'entries'
        }. The clone operation was aborted to prevent a partially-cloned structure.`
      );
    }
    await this.updateReferenceTree();
    return this.clones[this.entryId] as EntryProps;
  }

  getFailedUpdateIds(): string[] {
    return this.failedUpdateIds;
  }

  async getClonedAssetCount(): Promise<number> {
    const clonedAssetIds = await Promise.all(Object.values(this.assetClones));
    return clonedAssetIds.filter((clonedAssetId) => clonedAssetId !== null).length;
  }

  getRemovedAssetLinkCount(): number {
    return this.removedAssetLinkCount;
  }

  async getReferencesQty(): Promise<number> {
    await this.findReferences(this.entryId);
    return Object.keys(this.references).length;
  }

  async getReferenceTree(): Promise<CloneReferenceNode> {
    await this.findReferences(this.entryId);
    return this.buildReferenceNode(this.entryId, new Set());
  }

  async getReferenceEntries(options?: { signal?: AbortSignal }): Promise<CloneReferenceEntry[]> {
    await this.findReferences(this.entryId, undefined, options?.signal);

    const referencedByCounts: Record<string, number> = {};
    for (const childEntryIds of Object.values(this.referenceChildren)) {
      for (const childEntryId of childEntryIds) {
        referencedByCounts[childEntryId] = (referencedByCounts[childEntryId] || 0) + 1;
      }
    }

    // Discovery order is a pre-order walk of the first-seen spanning tree, so it preserves structure
    const referenceEntries: CloneReferenceEntry[] = [];
    for (const entryId of this.discoveryOrder) {
      const entry = this.references[entryId];
      if (!entry) {
        continue;
      }
      referenceEntries.push({
        entryId,
        label: await this.getEntryLabel(entry),
        contentTypeId: entry.sys.contentType.sys.id,
        depth: this.discoveryDepths[entryId] ?? 0,
        referencedByCount: referencedByCounts[entryId] || 0,
        parentEntryId: this.discoveryParents[entryId] ?? null,
        // Links to deleted entries were never fetched, so they cannot be selected
        childEntryIds: (this.referenceChildren[entryId] || []).filter(
          (childEntryId) => this.references[childEntryId] !== undefined
        ),
      });
    }

    return referenceEntries;
  }

  private throwIfDiscoveryAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new ReferenceDiscoveryAbortedError();
    }
  }

  private async findReferences(
    entryId: string,
    parentEntryId?: string,
    signal?: AbortSignal
  ): Promise<void> {
    this.throwIfDiscoveryAborted(signal);
    this.addChildReference(parentEntryId, entryId);

    if (this.references[entryId]) {
      return;
    }

    let entry;
    try {
      this.throwIfDiscoveryAborted(signal);
      entry = await this.cma.entry.get({ entryId: entryId });
    } catch (_error) {
      // Deleted entries are not found
    }

    if (entry !== undefined) {
      this.references[entryId] = entry;
      this.discoveryOrder.push(entryId);
      this.discoveryParents[entryId] = parentEntryId ?? null;
      this.discoveryDepths[entryId] =
        parentEntryId === undefined ? 0 : (this.discoveryDepths[parentEntryId] ?? 0) + 1;
      this.setReferencesCount(Object.keys(this.references).length);
      this.referenceChildren[entryId] ||= [];

      for (const fieldName in entry.fields) {
        const field = entry.fields[fieldName];

        for (const locale in field) {
          const fieldValue = field[locale];
          await this.inspectField(fieldValue, entryId, signal);
        }
      }
    }
  }

  private async createClones(): Promise<void> {
    const clonePromises = Object.entries(this.references).map(async ([entryId, entry]) => {
      try {
        const entryFields = await this.getFieldsForClone(entry);
        const createProps: CreateEntryProps = {
          fields: entryFields,
          ...(entry.metadata ? { metadata: entry.metadata } : {}),
        };
        const clone = await this.cma.entry.create(
          { contentTypeId: entry.sys.contentType.sys.id },
          createProps
        );
        this.clones[entryId] = clone;
        this.setClonesCount(Object.keys(this.clones).length);
      } catch (error) {
        console.warn('Error creating clone', error);
        this.failedCloneIds.push(entryId);
      }
    });

    await Promise.all(clonePromises);
  }

  private async updateReferenceTree(): Promise<void> {
    const updatePromises = Object.values(this.clones).map(async (clone) => {
      let cloneWasUpdated = false;
      for (const fieldId in clone.fields) {
        const field = clone.fields[fieldId];

        for (const locale in field) {
          const fieldValue = field[locale];
          const fieldWasUpdated = await this.updateReferencesOnField(fieldValue);
          cloneWasUpdated ||= fieldWasUpdated;
        }
      }

      if (cloneWasUpdated) {
        let latestClone = clone;
        for (let retryCount = 0; retryCount < 3; retryCount++) {
          try {
            await this.cma.entry.update(
              { entryId: latestClone.sys.id },
              {
                sys: { ...latestClone.sys, version: latestClone.sys.version },
                fields: clone.fields,
              }
            );
            this.updates++;
            this.setUpdatesCount(this.updates);
            break;
          } catch (error: any) {
            if (error.code === 'VersionMismatch') {
              console.warn('Error updating clone, retrying...', error);
              latestClone = await this.cma.entry.get({ entryId: clone.sys.id });
            } else {
              console.warn('Error updating clone.', error);
              this.failedUpdateIds.push(clone.sys.id);
              break;
            }
          }
        }
      }
    });

    await Promise.all(updatePromises);
  }

  private async inspectField(
    fieldValue: any,
    parentEntryId?: string,
    signal?: AbortSignal
  ): Promise<void> {
    if (!fieldValue) return;

    if (this.isReference(fieldValue)) {
      await this.findReferences(fieldValue.sys.id, parentEntryId, signal);
      return;
    }

    if (Array.isArray(fieldValue)) {
      for (const value of fieldValue) {
        await this.inspectField(value, parentEntryId, signal);
      }
      return;
    }

    if (this.isObject(fieldValue)) {
      for (const value of Object.values(fieldValue)) {
        await this.inspectField(value, parentEntryId, signal);
      }
    }
  }

  private async updateReferencesOnField(fieldValue: any): Promise<boolean> {
    if (!fieldValue) return false;

    if (this.isReference(fieldValue)) {
      const clone = this.clones[fieldValue.sys.id];
      if (clone !== undefined) {
        fieldValue.sys.id = clone.sys.id;
        return true;
      }
      return false;
    }

    if (Array.isArray(fieldValue)) {
      let didUpdateArray = false;
      for (const value of fieldValue) {
        if (await this.updateReferencesOnField(value)) {
          didUpdateArray = true;
        }
      }
      return didUpdateArray;
    }

    if (this.isObject(fieldValue)) {
      let didUpdateObject = false;
      for (const value of Object.values(fieldValue)) {
        if (await this.updateReferencesOnField(value)) {
          didUpdateObject = true;
        }
      }
      return didUpdateObject;
    }

    return false;
  }

  private async getFieldsForClone(entry: EntryProps): Promise<any> {
    // Create a deep copy of the entry fields to avoid modifying the original
    const entryFields = JSON.parse(JSON.stringify(entry.fields));

    const contentTypeId = entry.sys.contentType.sys.id;
    const contentType =
      this.contentTypes[contentTypeId] ||
      (await this.cma.contentType.get({ contentTypeId: contentTypeId }));
    this.contentTypes[contentTypeId] = contentType;

    const titleField = contentType.fields.find((field) => field.id === contentType.displayField);

    // Update title field for the clone
    if (titleField && entryFields[titleField.id]) {
      const titleFieldValues = entryFields[titleField.id];
      for (const locale in titleFieldValues) {
        const title = titleFieldValues[locale];
        titleFieldValues[locale] = this.applyCloneText(title);
      }
    }

    await this.replaceAssetLinks(entryFields);

    return entryFields;
  }

  private applyCloneText(title: string): string {
    return this.parameters.cloneTextBefore
      ? `${this.parameters.cloneText} ${title}`
      : `${title} ${this.parameters.cloneText}`;
  }

  // Assets are cloned so edits to a clone's media can't change the original; links to assets that fail to clone are removed
  private async replaceAssetLinks(entryFields: any): Promise<void> {
    const assetIds = new Set<string>();
    this.collectAssetIds(entryFields, assetIds);
    if (assetIds.size === 0) return;

    const clonedAssetIds: ClonedAssetIdMap = {};
    await Promise.all(
      [...assetIds].map(async (assetId) => {
        clonedAssetIds[assetId] = await this.getAssetClone(assetId);
      })
    );

    let removedCount = 0;
    for (const fieldId of Object.keys(entryFields)) {
      const field = entryFields[fieldId];
      for (const locale of Object.keys(field)) {
        const fieldValue = field[locale];
        if (this.isAssetReference(fieldValue)) {
          const clonedAssetId = clonedAssetIds[fieldValue.sys.id];
          if (clonedAssetId) {
            fieldValue.sys.id = clonedAssetId;
          } else {
            delete field[locale];
            removedCount++;
          }
        } else {
          removedCount += this.replaceNestedAssetLinks(fieldValue, clonedAssetIds);
        }
      }
      if (Object.keys(field).length === 0) {
        delete entryFields[fieldId];
      }
    }

    if (removedCount > 0) {
      delete entryFields[FOCAL_POINT_FIELD_ID];
      this.removedAssetLinkCount += removedCount;
    }
  }

  private collectAssetIds(fieldValue: any, assetIds: Set<string>): void {
    if (!this.isObject(fieldValue)) return;

    if (this.isAssetReference(fieldValue)) {
      assetIds.add(fieldValue.sys.id);
      return;
    }

    for (const value of Object.values(fieldValue)) {
      this.collectAssetIds(value, assetIds);
    }
  }

  private getNestedAssetLink(value: any): any {
    if (this.isAssetReference(value)) return value;
    // Rich text embedded-asset-block nodes hold the link in data.target
    if (this.isObject(value) && this.isAssetReference(value.data?.target)) return value.data.target;
    return null;
  }

  private replaceNestedAssetLinks(fieldValue: any, clonedAssetIds: ClonedAssetIdMap): number {
    if (!this.isObject(fieldValue)) return 0;

    let removedCount = 0;

    if (Array.isArray(fieldValue)) {
      for (let index = fieldValue.length - 1; index >= 0; index--) {
        const assetLink = this.getNestedAssetLink(fieldValue[index]);
        if (!assetLink) {
          removedCount += this.replaceNestedAssetLinks(fieldValue[index], clonedAssetIds);
          continue;
        }

        const clonedAssetId = clonedAssetIds[assetLink.sys.id];
        if (clonedAssetId) {
          assetLink.sys.id = clonedAssetId;
        } else {
          fieldValue.splice(index, 1);
          removedCount++;
        }
      }
      return removedCount;
    }

    for (const [key, value] of Object.entries(fieldValue)) {
      if (!this.isAssetReference(value)) {
        removedCount += this.replaceNestedAssetLinks(value, clonedAssetIds);
        continue;
      }

      const assetLink = value as any;
      const clonedAssetId = clonedAssetIds[assetLink.sys.id];
      if (clonedAssetId) {
        assetLink.sys.id = clonedAssetId;
      } else {
        delete fieldValue[key];
        removedCount++;
      }
    }
    return removedCount;
  }

  private getAssetClone(assetId: string): Promise<string | null> {
    // Memoized so an asset shared by several cloned entries is only duplicated once
    this.assetClones[assetId] ||= this.cloneAsset(assetId).catch((error) => {
      console.warn('Error cloning asset, its links will be removed from the clone', error);
      return null;
    });
    return this.assetClones[assetId];
  }

  private async cloneAsset(assetId: string): Promise<string> {
    const asset = await this.cma.asset.get({ assetId });

    const uploadFields: Record<string, { contentType: string; fileName: string; upload: string }> =
      {};
    for (const [locale, file] of Object.entries(asset.fields.file || {})) {
      if (!file?.url) continue;
      uploadFields[locale] = {
        contentType: file.contentType,
        fileName: file.fileName,
        upload: file.url.startsWith('//') ? `https:${file.url}` : file.url,
      };
    }
    if (Object.keys(uploadFields).length === 0) {
      throw new Error(`Asset ${assetId} has no processed file to clone`);
    }

    const titleFields: Record<string, string> = {};
    for (const [locale, title] of Object.entries(asset.fields.title || {})) {
      titleFields[locale] = this.applyCloneText(title);
    }

    const createdAsset: AssetProps = await this.cma.asset.create(
      {},
      {
        fields: {
          title: titleFields,
          ...(asset.fields.description ? { description: asset.fields.description } : {}),
          file: uploadFields as any,
        },
        ...(asset.metadata ? { metadata: asset.metadata } : {}),
      }
    );

    try {
      const processedAsset = await this.cma.asset.processForAllLocales(
        {},
        createdAsset,
        ASSET_PROCESSING_OPTIONS
      );
      return processedAsset.sys.id;
    } catch (error) {
      await this.cma.asset
        .delete({ assetId: createdAsset.sys.id })
        .catch((deleteError) => console.warn('Error deleting unprocessed asset', deleteError));
      throw error;
    }
  }

  private async getContentType(contentTypeId: string): Promise<ContentTypeProps> {
    const contentType =
      this.contentTypes[contentTypeId] ||
      (await this.cma.contentType.get({ contentTypeId: contentTypeId }));
    this.contentTypes[contentTypeId] = contentType;
    return contentType;
  }

  private async getEntryLabel(entry: EntryProps): Promise<string> {
    const contentTypeId = entry.sys.contentType.sys.id;
    const contentType = await this.getContentType(contentTypeId);
    const displayFieldId = contentType.displayField;

    if (displayFieldId && entry.fields[displayFieldId]) {
      const displayFieldValues = entry.fields[displayFieldId];
      const displayValue = Object.values(displayFieldValues).find(
        (value) => typeof value === 'string'
      );
      if (typeof displayValue === 'string' && displayValue.trim()) {
        return displayValue;
      }
    }

    return entry.sys.id;
  }

  private async buildReferenceNode(
    entryId: string,
    visitedEntryIds: Set<string>
  ): Promise<CloneReferenceNode> {
    const entry = this.references[entryId];
    const nextVisitedEntryIds = new Set(visitedEntryIds).add(entryId);
    const childEntryIds = this.referenceChildren[entryId] || [];
    const children: CloneReferenceNode[] = [];

    for (const childEntryId of childEntryIds) {
      if (nextVisitedEntryIds.has(childEntryId)) {
        continue;
      }
      children.push(await this.buildReferenceNode(childEntryId, nextVisitedEntryIds));
    }

    return {
      entryId,
      label: entry ? await this.getEntryLabel(entry) : entryId,
      children,
    };
  }

  private addChildReference(parentEntryId: string | undefined, childEntryId: string): void {
    if (!parentEntryId || parentEntryId === childEntryId) {
      return;
    }

    const childEntryIds = this.referenceChildren[parentEntryId] || [];
    if (!childEntryIds.includes(childEntryId)) {
      childEntryIds.push(childEntryId);
    }
    this.referenceChildren[parentEntryId] = childEntryIds;
  }

  private filterReferences(selectedEntryIds: string[]): void {
    const selectedEntryIdSet = new Set(selectedEntryIds);
    selectedEntryIdSet.add(this.entryId);

    this.references = Object.fromEntries(
      Object.entries(this.references).filter(([entryId]) => selectedEntryIdSet.has(entryId))
    );
  }

  private isReference(fieldValue: any): boolean {
    return fieldValue.sys && fieldValue.sys.type === 'Link' && fieldValue.sys.linkType === 'Entry';
  }

  private isAssetReference(fieldValue: any): boolean {
    return (
      this.isObject(fieldValue) &&
      fieldValue.sys?.type === 'Link' &&
      fieldValue.sys?.linkType === 'Asset'
    );
  }

  private isObject(fieldValue: any): boolean {
    return typeof fieldValue === 'object' && fieldValue !== null;
  }
}

export default EntryCloner;
