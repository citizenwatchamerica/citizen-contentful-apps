import { FieldControl, FieldDefinition, getFieldExclusion, getValueExclusion } from './fieldEligibility';
import type { TranslationConfig } from './permissions';
import { isVersionConflict, withRetry } from './retry';
import { FieldSegments, TranslateClient, toFieldSegments, translateFieldSegments } from './translateClient';

// Entries as the CMA stores them: `fields[fieldId][locale]` only holds values explicitly entered
// for that locale. Locale fallback (fr-CA -> en-CA -> en-US) is applied at delivery time and is
// never stored, so a value present here really is an explicit translation.
export interface RawEntry {
  sys: {
    id: string;
    version: number;
    contentType: { sys: { id: string } };
    archivedVersion?: number;
  };
  fields: Record<string, Record<string, unknown> | undefined>;
}

export interface ContentTypeInfo {
  sys: { id: string };
  name: string;
  displayField?: string;
  fields: FieldDefinition[];
}

interface EditorInterfaceInfo {
  sys: { contentType: { sys: { id: string } } };
  controls?: FieldControl[];
}

interface Collection<T> {
  items: T[];
}

export interface BulkClient extends TranslateClient {
  entry: {
    getMany: (params: { query: Record<string, string | number> }) => Promise<Collection<RawEntry>>;
    get: (params: { entryId: string }) => Promise<RawEntry>;
    update: (params: { entryId: string }, entry: RawEntry) => Promise<RawEntry>;
  };
  contentType: {
    getMany: (params: { query: Record<string, string | number> }) => Promise<Collection<ContentTypeInfo>>;
  };
  editorInterface: {
    getMany: (params: Record<string, never>) => Promise<Collection<EditorInterfaceInfo>>;
  };
}

export type FieldStatus = 'translate' | 'existing' | 'excluded' | 'empty';

export interface FieldPlan {
  fieldId: string;
  fieldName: string;
  status: FieldStatus;
  reason?: string;
}

export interface EntryPlan {
  entryId: string;
  contentTypeId: string;
  contentTypeName: string;
  displayName: string;
  fields: FieldPlan[];
}

export interface ContentModel {
  contentTypes: Map<string, ContentTypeInfo>;
  controls: Map<string, Map<string, FieldControl>>;
}

export interface PlanOptions {
  // Not exposed in the UI yet - reserved for an admin-only "overwrite existing" option.
  overwrite?: boolean;
}

export const parseEntryIds = (input: string): string[] => [
  ...new Set(
    input
      .split(/[\s,]+/)
      .map(entryId => entryId.trim())
      .filter(Boolean)
  ),
];

export const loadContentModel = async (cma: BulkClient): Promise<ContentModel> => {
  const [contentTypeCollection, editorInterfaceCollection] = await Promise.all([
    withRetry(() => cma.contentType.getMany({ query: { limit: 1000 } })),
    withRetry(() => cma.editorInterface.getMany({})),
  ]);

  const contentTypes = new Map(contentTypeCollection.items.map(contentType => [contentType.sys.id, contentType]));
  const controls = new Map(
    editorInterfaceCollection.items.map(editorInterface => [
      editorInterface.sys.contentType.sys.id,
      new Map((editorInterface.controls ?? []).map(control => [control.fieldId, control])),
    ])
  );
  return { contentTypes, controls };
};

export interface LoadedEntries {
  entries: RawEntry[];
  notFound: string[];
  archived: string[];
}

const ENTRY_FETCH_PAGE_SIZE = 100;

export const loadEntries = async (cma: BulkClient, entryIds: string[]): Promise<LoadedEntries> => {
  const found = new Map<string, RawEntry>();
  for (let start = 0; start < entryIds.length; start += ENTRY_FETCH_PAGE_SIZE) {
    const page = entryIds.slice(start, start + ENTRY_FETCH_PAGE_SIZE);
    const collection = await withRetry(() =>
      cma.entry.getMany({ query: { 'sys.id[in]': page.join(','), limit: ENTRY_FETCH_PAGE_SIZE } })
    );
    collection.items.forEach(entry => found.set(entry.sys.id, entry));
  }

  const entries: RawEntry[] = [];
  const notFound: string[] = [];
  const archived: string[] = [];
  for (const entryId of entryIds) {
    const entry = found.get(entryId);
    if (!entry) notFound.push(entryId);
    else if (entry.sys.archivedVersion) archived.push(entryId);
    else entries.push(entry);
  }
  return { entries, notFound, archived };
};

const hasExplicitValue = (type: string, value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (type === 'RichText') return toFieldSegments(type, value) !== null;
  return true;
};

const firstLocaleValue = (localizedValue: Record<string, unknown> | undefined, preferredLocale: string) => {
  if (!localizedValue) return undefined;
  return localizedValue[preferredLocale] ?? Object.values(localizedValue).find(value => value != null);
};

const resolveDisplayName = (entry: RawEntry, contentType: ContentTypeInfo | undefined, locale: string): string => {
  const candidates = [contentType?.displayField, 'internalName', 'title', 'name'].filter(Boolean) as string[];
  for (const fieldId of candidates) {
    const value = firstLocaleValue(entry.fields[fieldId], locale);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

interface PlannedField extends FieldPlan {
  definition: FieldDefinition;
}

const planFields = (
  entry: RawEntry,
  model: ContentModel,
  config: TranslationConfig,
  { overwrite = false }: PlanOptions
): PlannedField[] => {
  const contentTypeId = entry.sys.contentType.sys.id;
  const contentType = model.contentTypes.get(contentTypeId);
  const controls = model.controls.get(contentTypeId);

  return (contentType?.fields ?? []).map(definition => {
    const base = { fieldId: definition.id, fieldName: definition.name ?? definition.id, definition };

    const fieldExclusion = getFieldExclusion(definition, controls?.get(definition.id));
    if (fieldExclusion) return { ...base, status: 'excluded', reason: fieldExclusion };

    const sourceValue = entry.fields[definition.id]?.[config.source];
    if (!toFieldSegments(definition.type, sourceValue)) {
      return { ...base, status: 'empty', reason: 'No source value' };
    }

    if (definition.type !== 'RichText') {
      const valueExclusion = getValueExclusion(sourceValue as string);
      if (valueExclusion) return { ...base, status: 'excluded', reason: valueExclusion };
    }

    const targetValue = entry.fields[definition.id]?.[config.target];
    if (!overwrite && hasExplicitValue(definition.type, targetValue)) {
      return { ...base, status: 'existing', reason: 'Target value already exists' };
    }

    return { ...base, status: 'translate' };
  });
};

export const planEntry = (
  entry: RawEntry,
  model: ContentModel,
  config: TranslationConfig,
  options: PlanOptions = {}
): EntryPlan => {
  const contentTypeId = entry.sys.contentType.sys.id;
  const contentType = model.contentTypes.get(contentTypeId);
  return {
    entryId: entry.sys.id,
    contentTypeId,
    contentTypeName: contentType?.name ?? contentTypeId,
    displayName: resolveDisplayName(entry, contentType, config.source),
    fields: planFields(entry, model, config, options).map(({ definition: _definition, ...plan }) => plan),
  };
};

export type EntryOutcome = 'translated' | 'skipped' | 'failed';

export interface EntryResult extends EntryPlan {
  outcome: EntryOutcome;
  error?: string;
}

export interface TranslateEntryRequest {
  cma: BulkClient;
  appDefinitionId: string;
  model: ContentModel;
  config: TranslationConfig;
  protectedTerms: string[];
  options?: PlanOptions;
}

const MAX_CONFLICT_ATTEMPTS = 3;

// Re-fetches the entry, re-plans it against its latest version, translates only the planned
// fields and writes just the target locale. Never publishes: a published entry becomes
// "Changed" and a draft stays a draft. If someone edits the entry mid-run Contentful rejects
// the stale version, so the whole entry is re-read and re-planned (translations already fetched
// for unchanged source text are reused rather than paid for twice).
export const translateEntry = async (request: TranslateEntryRequest, entryId: string): Promise<EntryResult> => {
  const { cma, model, config } = request;
  const translationCache = new Map<string, unknown>();
  let plan: EntryPlan | null = null;

  try {
    for (let attempt = 1; ; attempt++) {
      const entry = await withRetry(() => cma.entry.get({ entryId }));
      const plannedFields = planFields(entry, model, config, request.options ?? {});
      plan = planEntry(entry, model, config, request.options);

      const toTranslate = plannedFields.filter(field => field.status === 'translate');
      if (toTranslate.length === 0) return { ...plan, outcome: 'skipped' };

      const cacheKey = (field: PlannedField) =>
        `${field.fieldId}::${JSON.stringify(entry.fields[field.fieldId]?.[config.source])}`;
      const uncached = toTranslate.filter(field => !translationCache.has(cacheKey(field)));
      if (uncached.length > 0) {
        const segments = uncached.map(
          field => toFieldSegments(field.definition.type, entry.fields[field.fieldId]?.[config.source]) as FieldSegments
        );
        const translatedValues = await translateFieldSegments(
          { cma, appDefinitionId: request.appDefinitionId, config, protectedTerms: request.protectedTerms },
          segments
        );
        uncached.forEach((field, index) => translationCache.set(cacheKey(field), translatedValues[index]));
      }

      for (const field of toTranslate) {
        entry.fields[field.fieldId] = {
          ...entry.fields[field.fieldId],
          [config.target]: translationCache.get(cacheKey(field)),
        };
      }

      try {
        await withRetry(() => cma.entry.update({ entryId }, entry));
        return { ...plan, outcome: 'translated' };
      } catch (error) {
        if (!isVersionConflict(error) || attempt >= MAX_CONFLICT_ATTEMPTS) throw error;
      }
    }
  } catch (error) {
    const fallbackPlan: EntryPlan = plan ?? {
      entryId,
      contentTypeId: '',
      contentTypeName: '',
      displayName: '',
      fields: [],
    };
    return { ...fallbackPlan, outcome: 'failed', error: describeError(error) };
  }
};

export const describeError = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : (error as { message?: unknown })?.message;
  if (typeof rawMessage === 'string') {
    try {
      const parsed = JSON.parse(rawMessage);
      const details: string[] = Array.isArray(parsed?.details?.errors)
        ? parsed.details.errors.map((detail: { details?: string }) => detail?.details).filter(Boolean)
        : [];
      if (typeof parsed?.message === 'string') {
        return details.length ? `${parsed.message}: ${details.join('; ')}` : parsed.message;
      }
    } catch {
      return rawMessage;
    }
    return rawMessage;
  }
  return typeof error === 'string' ? error : 'Unknown error';
};

export interface PlanTotals {
  entries: number;
  entriesWithWork: number;
  translate: number;
  existing: number;
  excluded: number;
  empty: number;
}

export const summarizePlans = (plans: EntryPlan[]): PlanTotals => {
  const totals: PlanTotals = { entries: plans.length, entriesWithWork: 0, translate: 0, existing: 0, excluded: 0, empty: 0 };
  for (const plan of plans) {
    if (plan.fields.some(field => field.status === 'translate')) totals.entriesWithWork++;
    for (const field of plan.fields) totals[field.status]++;
  }
  return totals;
};

const fieldNamesWithStatus = (plan: EntryPlan, status: FieldStatus) =>
  plan.fields
    .filter(field => field.status === status)
    .map(field => (field.reason && status === 'excluded' ? `${field.fieldId} (${field.reason})` : field.fieldId))
    .join('; ');

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export const buildCsv = (results: Array<EntryPlan & { outcome?: string; error?: string }>, config: TranslationConfig) => {
  const header = [
    'Entry ID',
    'Content type',
    'Name',
    'Source locale',
    'Target locale',
    'Outcome',
    'Fields translated',
    'Skipped (target value exists)',
    'Excluded by rules',
    'Error',
  ];
  const rows = results.map(result => [
    result.entryId,
    result.contentTypeName,
    result.displayName,
    config.source,
    config.target,
    result.outcome ?? 'planned',
    fieldNamesWithStatus(result, 'translate'),
    fieldNamesWithStatus(result, 'existing'),
    fieldNamesWithStatus(result, 'excluded'),
    result.error ?? '',
  ]);
  return [header, ...rows].map(row => row.map(cell => csvCell(String(cell))).join(',')).join('\n');
};
