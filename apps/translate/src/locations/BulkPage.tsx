import { PageAppSDK } from '@contentful/app-sdk';
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  Heading,
  Note,
  Paragraph,
  Select,
  Table,
  Text,
  Textarea,
} from '@contentful/f36-components';
import tokens from '@contentful/f36-tokens';
import { useSDK } from '@contentful/react-apps-toolkit';
import { css } from 'emotion';
import { useMemo, useRef, useState } from 'react';
import {
  BulkClient,
  ContentModel,
  EntryPlan,
  EntryResult,
  buildCsv,
  describeError,
  loadContentModel,
  loadEntries,
  parseEntryIds,
  planEntry,
  summarizePlans,
  translateEntry,
} from '../utils/bulkTranslate';
import { AppInstallationParameters, getAllTranslationConfigs, parseProtectedTerms } from '../utils/permissions';
import { runPool } from '../utils/retry';

type Phase = 'input' | 'checking' | 'planned' | 'running' | 'done';

// Entries processed at once. Each one makes a handful of CMA calls plus one or two App Action
// calls, so this keeps well inside Contentful's and OpenAI's rate limits.
const ENTRY_CONCURRENCY = 3;

interface Progress {
  completed: number;
  translated: number;
  skipped: number;
  failed: number;
}

const EMPTY_PROGRESS: Progress = { completed: 0, translated: 0, skipped: 0, failed: 0 };

const fieldIdsWithStatus = (plan: EntryPlan, status: string) =>
  plan.fields.filter(field => field.status === status).map(field => field.fieldId);

const outcomeBadge = (outcome?: string) => {
  if (outcome === 'translated') return <Badge variant="positive">Translated</Badge>;
  if (outcome === 'skipped') return <Badge variant="secondary">Skipped</Badge>;
  if (outcome === 'failed') return <Badge variant="negative">Failed</Badge>;
  return null;
};

const BulkPage = () => {
  const sdk = useSDK<PageAppSDK>();
  const cma = sdk.cma as unknown as BulkClient;
  const parameters = sdk.parameters.installation as AppInstallationParameters;

  const configs = useMemo(() => getAllTranslationConfigs(parameters), [parameters]);
  const protectedTerms = useMemo(() => parseProtectedTerms(parameters?.protectedTerms), [parameters]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [entryIdInput, setEntryIdInput] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [model, setModel] = useState<ContentModel | null>(null);
  const [plans, setPlans] = useState<EntryPlan[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [archived, setArchived] = useState<string[]>([]);
  const [results, setResults] = useState<EntryResult[]>([]);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [pageError, setPageError] = useState<string | null>(null);
  const stopRequested = useRef(false);

  const config = configs[selectedIndex];
  const entryIds = useMemo(() => parseEntryIds(entryIdInput), [entryIdInput]);
  const totals = useMemo(() => summarizePlans(plans), [plans]);
  const localeName = (locale: string) => sdk.locales.names[locale] ?? locale;

  if (!sdk.user.spaceMembership.admin) {
    return (
      <Box padding="spacingXl">
        <Note variant="warning">Bulk translation is limited to space admins.</Note>
      </Box>
    );
  }

  if (configs.length === 0) {
    return (
      <Box padding="spacingXl">
        <Note variant="warning">
          No translation rules are configured. Add at least one rule in the Translate app configuration.
        </Note>
      </Box>
    );
  }

  const resetToInput = () => {
    setPhase('input');
    setPlans([]);
    setResults([]);
    setProgress(EMPTY_PROGRESS);
    setPageError(null);
  };

  const handleDryRun = async () => {
    setPhase('checking');
    setPageError(null);
    try {
      const contentModel = model ?? (await loadContentModel(cma));
      setModel(contentModel);
      const loaded = await loadEntries(cma, entryIds);
      setPlans(loaded.entries.map(entry => planEntry(entry, contentModel, config)));
      setNotFound(loaded.notFound);
      setArchived(loaded.archived);
      setPhase('planned');
    } catch (error) {
      setPageError(describeError(error));
      setPhase('input');
    }
  };

  const handleRun = async () => {
    if (!model) return;
    const entriesToRun = plans.filter(plan => plan.fields.some(field => field.status === 'translate'));
    const confirmed = await sdk.dialogs.openConfirm({
      title: 'Start bulk translation?',
      message:
        `This writes ${localeName(config.target)} values into ${entriesToRun.length} entries, translated from ` +
        `${localeName(config.source)}. Only empty ${localeName(config.target)} fields are filled. Nothing is published.`,
      confirmLabel: 'Translate',
      cancelLabel: 'Cancel',
      intent: 'primary',
    });
    if (!confirmed) return;

    stopRequested.current = false;
    setPhase('running');
    setProgress(EMPTY_PROGRESS);

    // Entries the dry run found nothing to do for are reported as skipped without being re-fetched.
    const collected: EntryResult[] = plans
      .filter(plan => !entriesToRun.includes(plan))
      .map(plan => ({ ...plan, outcome: 'skipped' }));
    setResults([...collected]);
    setProgress({ ...EMPTY_PROGRESS, completed: collected.length, skipped: collected.length });

    // sdk.ids.app is always set inside an app location - only typed optional by the SDK.
    const request = { cma, appDefinitionId: sdk.ids.app!, model, config, protectedTerms };
    await runPool(
      entriesToRun,
      ENTRY_CONCURRENCY,
      async plan => {
        const result = await translateEntry(request, plan.entryId);
        collected.push(result);
        setResults([...collected]);
        setProgress(previous => ({
          completed: previous.completed + 1,
          translated: previous.translated + (result.outcome === 'translated' ? 1 : 0),
          skipped: previous.skipped + (result.outcome === 'skipped' ? 1 : 0),
          failed: previous.failed + (result.outcome === 'failed' ? 1 : 0),
        }));
      },
      () => stopRequested.current
    );

    setPhase('done');
  };

  const downloadCsv = () => {
    const rows = phase === 'done' ? results : plans;
    const blob = new Blob([buildCsv(rows, config)], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `translate-${config.source}-to-${config.target}-${phase === 'done' ? 'results' : 'dry-run'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const isBusy = phase === 'checking' || phase === 'running';
  const rows: Array<EntryPlan & { outcome?: string; error?: string }> =
    phase === 'running' || phase === 'done' ? results : plans;

  return (
    <Box padding="spacingXl" className={css({ maxWidth: '1200px', margin: '0 auto' })}>
      <Heading>Bulk translate</Heading>
      <Paragraph>
        Fills empty target-locale fields on many entries at once using the same rules, guidance and
        translator as the sidebar. Existing target values are never overwritten, structural fields are
        never touched, and nothing is published.
      </Paragraph>

      <Flex flexDirection="column" gap="spacingL" marginBottom="spacingL" className={css({ maxWidth: '800px' })}>
        <FormControl id="bulk-rule" marginBottom="none">
          <FormControl.Label>Translation direction</FormControl.Label>
          <Select
            value={String(selectedIndex)}
            isDisabled={isBusy}
            onChange={e => {
              setSelectedIndex(Number(e.target.value));
              resetToInput();
            }}
          >
            {configs.map((rule, index) => (
              <Select.Option key={index} value={String(index)}>
                {localeName(rule.source)} → {localeName(rule.target)} ({rule.roles.join(', ')})
              </Select.Option>
            ))}
          </Select>
          {config.guidance && <FormControl.HelpText>Guidance: {config.guidance}</FormControl.HelpText>}
        </FormControl>

        <FormControl id="bulk-entry-ids" marginBottom="none">
          <FormControl.Label>Entry IDs</FormControl.Label>
          <Textarea
            rows={6}
            value={entryIdInput}
            isDisabled={isBusy}
            onChange={e => {
              setEntryIdInput(e.target.value);
              if (phase !== 'input') resetToInput();
            }}
            placeholder="One entry ID per line"
          />
          <FormControl.HelpText>
            {entryIds.length} unique ID{entryIds.length === 1 ? '' : 's'}
          </FormControl.HelpText>
        </FormControl>
      </Flex>

      <Flex gap="spacingS" marginBottom="spacingL">
        <Button
          variant="secondary"
          isDisabled={isBusy || entryIds.length === 0}
          isLoading={phase === 'checking'}
          onClick={handleDryRun}
        >
          Dry run
        </Button>
        {phase === 'planned' && totals.translate > 0 && (
          <Button variant="primary" onClick={handleRun}>
            Translate {totals.translate} field{totals.translate === 1 ? '' : 's'} in {totals.entriesWithWork}{' '}
            entr{totals.entriesWithWork === 1 ? 'y' : 'ies'}
          </Button>
        )}
        {phase === 'running' && (
          <Button variant="negative" onClick={() => (stopRequested.current = true)}>
            Stop after current entries
          </Button>
        )}
        {(phase === 'planned' || phase === 'done') && (
          <Button variant="transparent" onClick={downloadCsv}>
            Download CSV
          </Button>
        )}
      </Flex>

      {pageError && (
        <Note variant="negative" className={css({ marginBottom: tokens.spacingL })}>
          {pageError}
        </Note>
      )}

      {phase === 'planned' && (
        <Note variant={totals.translate > 0 ? 'primary' : 'neutral'} className={css({ marginBottom: tokens.spacingL })}>
          <Text fontWeight="fontWeightDemiBold">Dry run - nothing has been changed.</Text>
          <br />
          {totals.entries} entries found · {totals.translate} fields to translate · {totals.existing} already
          localized (skipped) · {totals.excluded} structural/system fields excluded · {totals.empty} with no
          source value
          {notFound.length > 0 && (
            <>
              <br />
              Not found ({notFound.length}): {notFound.join(', ')}
            </>
          )}
          {archived.length > 0 && (
            <>
              <br />
              Archived, skipped ({archived.length}): {archived.join(', ')}
            </>
          )}
        </Note>
      )}

      {(phase === 'running' || phase === 'done') && (
        <Box marginBottom="spacingL">
          <Text fontWeight="fontWeightDemiBold">
            {phase === 'running' ? `Entry ${progress.completed} of ${plans.length}` : 'Finished'} · Translated:{' '}
            {progress.translated} | Skipped: {progress.skipped} | Failed: {progress.failed}
          </Text>
          <div
            className={css({
              height: '6px',
              marginTop: tokens.spacingXs,
              background: tokens.gray200,
              borderRadius: '3px',
              overflow: 'hidden',
            })}
          >
            <div
              className={css({
                height: '100%',
                width: `${plans.length ? (progress.completed / plans.length) * 100 : 0}%`,
                background: progress.failed ? tokens.colorWarning : tokens.colorPrimary,
                transition: 'width 0.3s',
              })}
            />
          </div>
        </Box>
      )}

      {rows.length > 0 && (
        <Table>
          <Table.Head>
            <Table.Row>
              <Table.Cell>Entry</Table.Cell>
              <Table.Cell>Content type</Table.Cell>
              <Table.Cell>To translate</Table.Cell>
              <Table.Cell>Already localized</Table.Cell>
              <Table.Cell>Excluded</Table.Cell>
              {(phase === 'running' || phase === 'done') && <Table.Cell>Result</Table.Cell>}
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {rows.map(row => {
              const excluded = row.fields.filter(field => field.status === 'excluded');
              return (
                <Table.Row key={row.entryId}>
                  <Table.Cell>
                    <Text fontWeight="fontWeightMedium">{row.displayName || '(untitled)'}</Text>
                    <br />
                    <Text fontColor="gray600" fontSize="fontSizeS">
                      {row.entryId}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>{row.contentTypeName}</Table.Cell>
                  <Table.Cell>{fieldIdsWithStatus(row, 'translate').join(', ') || '-'}</Table.Cell>
                  <Table.Cell>{fieldIdsWithStatus(row, 'existing').join(', ') || '-'}</Table.Cell>
                  <Table.Cell>
                    <span title={excluded.map(field => `${field.fieldId}: ${field.reason}`).join('\n')}>
                      {excluded.length}
                    </span>
                  </Table.Cell>
                  {(phase === 'running' || phase === 'done') && (
                    <Table.Cell>
                      {outcomeBadge(row.outcome)}
                      {row.error && (
                        <Text fontColor="red600" fontSize="fontSizeS" as="p">
                          {row.error}
                        </Text>
                      )}
                    </Table.Cell>
                  )}
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      )}
    </Box>
  );
};

export default BulkPage;
