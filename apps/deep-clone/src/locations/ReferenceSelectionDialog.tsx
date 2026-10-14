import { useMemo, useState } from 'react';
import { DialogAppSDK } from '@contentful/app-sdk';
import { useAutoResizer, useSDK } from '@contentful/react-apps-toolkit';
import {
  Box,
  Button,
  Checkbox,
  EntityList,
  Flex,
  Heading,
  Paragraph,
  Stack,
  Text,
} from '@contentful/f36-components';
import { css } from '@emotion/css';
import { CloneReferenceAsset, CloneReferenceEntry } from '../utils/EntryCloner';

type DialogInvocationParameters = {
  rootEntryId: string;
  referenceEntries: CloneReferenceEntry[];
  referenceAssets?: Record<string, CloneReferenceAsset>;
};

const styles = {
  root: css({
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#ffffff',
  }),
  header: css({
    padding: '24px 24px 16px',
    borderBottom: '1px solid #e5ebf1',
  }),
  content: css({
    flex: 1,
    padding: '20px 24px',
    overflowY: 'auto',
  }),
  controls: css({
    padding: '16px 24px 24px',
    borderTop: '1px solid #e5ebf1',
    backgroundColor: '#ffffff',
  }),
  entryRow: css({
    width: '100%',
    // Top-align the checkbox so it stays with the name when the description wraps
    '& label': {
      alignItems: 'flex-start',
    },
    '& label > span:first-of-type': {
      marginTop: '2px',
    },
  }),
  // The description stays inline when it fits and drops below the name as a whole when it doesn't
  entryText: css({
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: '8px',
    flex: '1 1 auto',
    minWidth: 0,
  }),
  // Lines the media up under the entry name rather than the checkbox
  mediaList: css({
    marginTop: '8px',
    marginLeft: '28px',
  }),
  nestedEntryRow: css({
    paddingLeft: '12px',
    borderLeft: '1px solid #d3dce6',
  }),
};

const INDENT_PX = 20;

function formatMediaCount(count: number): string {
  return `${count} media ${count === 1 ? 'file' : 'files'}`;
}
// Keeps very deep graphs readable in the dialog width
const MAX_INDENT_DEPTH = 8;

function getEntryDescription(
  entry: CloneReferenceEntry,
  isRoot: boolean,
  parentLabel: string | undefined
): string {
  if (isRoot) {
    return 'Root entry';
  }
  let description = `${entry.contentTypeId} · ${entry.entryId}`;
  // Past the indent cap rows stop shifting, so name the parent to keep the structure readable
  if (entry.depth > MAX_INDENT_DEPTH && parentLabel) {
    description = `${description} · under ${parentLabel}`;
  }
  const otherParentCount = entry.referencedByCount - 1;
  if (otherParentCount > 0) {
    return `${description} · also referenced by ${otherParentCount} other ${
      otherParentCount === 1 ? 'entry' : 'entries'
    }`;
  }
  return description;
}

function getMediaDescription(asset: CloneReferenceAsset, isEntrySelected: boolean): string {
  if (!isEntrySelected) {
    return 'Not copied: this entry stays linked to the original';
  }
  if (!asset.canCopy) {
    return "Can't be copied, so it will be removed from the clone";
  }
  return asset.fileName ? `Copied as a new asset · ${asset.fileName}` : 'Copied as a new asset';
}

// An unselected entry stays linked to its original, so anything reachable only through it would be an orphan clone
function pruneUnreachable(
  selectedEntryIds: Set<string>,
  rootEntryId: string,
  entriesById: Map<string, CloneReferenceEntry>
): Set<string> {
  const reachableEntryIds = new Set<string>();
  const pendingEntryIds = [rootEntryId];
  while (pendingEntryIds.length > 0) {
    const entryId = pendingEntryIds.pop()!;
    if (reachableEntryIds.has(entryId) || !selectedEntryIds.has(entryId)) {
      continue;
    }
    reachableEntryIds.add(entryId);
    pendingEntryIds.push(...(entriesById.get(entryId)?.childEntryIds ?? []));
  }
  return reachableEntryIds;
}

function ReferenceSelectionDialog() {
  const sdk = useSDK<DialogAppSDK>();
  const invocationParameters = sdk.parameters.invocation as DialogInvocationParameters;
  const { rootEntryId, referenceEntries, referenceAssets = {} } = invocationParameters;
  useAutoResizer();

  const allEntryIds = useMemo(
    () => referenceEntries.map((entry) => entry.entryId),
    [referenceEntries]
  );
  const entriesById = useMemo(
    () => new Map(referenceEntries.map((entry) => [entry.entryId, entry])),
    [referenceEntries]
  );
  const nestedEntryIdsByParent = useMemo(() => {
    const nestedEntryIds = new Map<string, string[]>();
    for (const entry of referenceEntries) {
      if (entry.parentEntryId === null) {
        continue;
      }
      const siblings = nestedEntryIds.get(entry.parentEntryId) ?? [];
      siblings.push(entry.entryId);
      nestedEntryIds.set(entry.parentEntryId, siblings);
    }
    return nestedEntryIds;
  }, [referenceEntries]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set(allEntryIds));

  const selectedReferenceCount = selectedEntryIds.size - 1;
  const totalReferenceCount = allEntryIds.length - 1;
  const allReferencesSelected = selectedReferenceCount === totalReferenceCount;
  // Only selected entries are cloned, so only their media is copied; shared assets are copied once
  const mediaToCopyCount = useMemo(
    () =>
      new Set(
        referenceEntries
          .filter((entry) => selectedEntryIds.has(entry.entryId))
          .flatMap((entry) => entry.assetIds)
          .filter((assetId) => referenceAssets[assetId]?.canCopy !== false)
      ).size,
    [referenceEntries, referenceAssets, selectedEntryIds]
  );

  const handleToggleEntry = (entryId: string, checked: boolean) => {
    if (entryId === rootEntryId) {
      return;
    }

    setSelectedEntryIds((currentSelectedEntryIds) => {
      const nextSelectedEntryIds = new Set(currentSelectedEntryIds);

      if (!checked) {
        nextSelectedEntryIds.delete(entryId);
        return pruneUnreachable(nextSelectedEntryIds, rootEntryId, entriesById);
      }

      let ancestorEntryId = entriesById.get(entryId)?.parentEntryId ?? null;
      while (ancestorEntryId !== null) {
        nextSelectedEntryIds.add(ancestorEntryId);
        ancestorEntryId = entriesById.get(ancestorEntryId)?.parentEntryId ?? null;
      }

      const pendingEntryIds = [entryId];
      while (pendingEntryIds.length > 0) {
        const nestedEntryId = pendingEntryIds.pop()!;
        nextSelectedEntryIds.add(nestedEntryId);
        pendingEntryIds.push(...(nestedEntryIdsByParent.get(nestedEntryId) ?? []));
      }
      return nextSelectedEntryIds;
    });
  };

  const handleToggleAllReferences = () => {
    setSelectedEntryIds(allReferencesSelected ? new Set([rootEntryId]) : new Set(allEntryIds));
  };

  const handleCancel = () => {
    sdk.close(null);
  };

  const handleConfirm = () => {
    sdk.close(Array.from(selectedEntryIds));
  };

  return (
    <Box className={styles.root}>
      <Box className={styles.header}>
        <Heading marginBottom="spacingXs">Select entries to clone</Heading>
        <Paragraph marginBottom="none">
          Review referenced entries and deselect any you want to keep linked to the originals
          instead of cloning. Deselecting an entry also deselects entries that are only referenced
          through it.
        </Paragraph>
        <Paragraph marginTop="spacingXs" marginBottom="none">
          Images and files linked from the entries you clone are copied too, so the clone never
          shares media with the original.
        </Paragraph>
      </Box>

      <Box className={styles.content}>
        <Flex justifyContent="space-between" alignItems="center" marginBottom="spacingM">
          <Text fontColor="gray700" fontWeight="fontWeightMedium">
            {`Selected ${selectedReferenceCount} of ${totalReferenceCount} referenced ${
              totalReferenceCount === 1 ? 'entry' : 'entries'
            }`}
            {mediaToCopyCount > 0 && ` · ${formatMediaCount(mediaToCopyCount)} to copy`}
          </Text>
          <Button variant="secondary" size="small" onClick={handleToggleAllReferences}>
            {allReferencesSelected ? 'Deselect all references' : 'Select all references'}
          </Button>
        </Flex>

        <Stack spacing="spacingS" flexDirection="column" alignItems="stretch">
          {referenceEntries.map((entry) => {
            const isRoot = entry.entryId === rootEntryId;
            const isChecked = selectedEntryIds.has(entry.entryId);

            const indentDepth = Math.min(entry.depth, MAX_INDENT_DEPTH);

            return (
              <Box
                key={entry.entryId}
                testId={`reference-row-${entry.entryId}`}
                className={indentDepth > 0 ? styles.nestedEntryRow : ''}
                style={{ marginLeft: `${indentDepth * INDENT_PX}px` }}>
                <Checkbox
                  className={styles.entryRow}
                  isChecked={isChecked}
                  isDisabled={isRoot}
                  onChange={(event) => handleToggleEntry(entry.entryId, event.target.checked)}>
                  <span className={styles.entryText}>
                    <Text fontWeight={isRoot ? 'fontWeightDemiBold' : 'fontWeightMedium'}>
                      {entry.label}
                    </Text>
                    <Text fontColor="gray500" fontSize="fontSizeS">
                      {getEntryDescription(
                        entry,
                        isRoot,
                        entry.parentEntryId === null
                          ? undefined
                          : entriesById.get(entry.parentEntryId)?.label
                      )}
                    </Text>
                  </span>
                </Checkbox>
                {entry.assetIds.length > 0 && (
                  <EntityList className={styles.mediaList} testId={`media-list-${entry.entryId}`}>
                    {entry.assetIds.map((assetId) => {
                      const asset = referenceAssets[assetId] ?? {
                        assetId,
                        title: assetId,
                        fileName: null,
                        thumbnailUrl: null,
                        canCopy: true,
                      };
                      return (
                        <EntityList.Item
                          key={assetId}
                          entityType="asset"
                          title={asset.title}
                          description={getMediaDescription(asset, isChecked)}
                          withThumbnail
                          {...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {})}
                        />
                      );
                    })}
                  </EntityList>
                )}
              </Box>
            );
          })}
        </Stack>
      </Box>

      <Flex justifyContent="flex-end" alignItems="center" className={styles.controls}>
        <Button variant="transparent" size="small" onClick={handleCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="small" onClick={handleConfirm}>
          Clone selected entries
        </Button>
      </Flex>
    </Box>
  );
}

export default ReferenceSelectionDialog;
