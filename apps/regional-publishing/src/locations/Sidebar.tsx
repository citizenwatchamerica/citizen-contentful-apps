import { SidebarAppSDK } from '@contentful/app-sdk';
import {
  Button,
  EntityStatusBadge,
  Flex,
  Note,
  Select,
  Subheading,
  Text,
  TextInput,
  TextLink,
} from '@contentful/f36-components';
import { useAutoResizer, useSDK } from '@contentful/react-apps-toolkit';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEntryStatus } from '../utils/entryStatus';
import { getLocaleStatuses } from '../utils/localeStatus';
import { AppInstallationParameters, getAllowedLocales } from '../utils/permissions';
import { publishLocales } from '../utils/publishLocales';
import { unpublishEntry, unpublishLocales } from '../utils/unpublishLocales';
import type { DialogMode } from './Dialog';
import {
  cancelScheduledAction,
  createScheduledAction,
  listScheduledActions,
  ScheduledActionType,
  ScheduledEntryAction,
} from '../utils/scheduledActions';

const actionCopy = {
  publish: { title: 'Publish regions', done: 'Published', failed: 'Publish failed' },
  unpublish: { title: 'Unpublish regions', done: 'Unpublished', failed: 'Unpublish failed' },
};

interface ExtractedError {
  message: string;
  // Only populated when Contentful reports more than one field/locale issue at once - a single
  // issue is folded straight into `message` instead, so simple errors stay a one-liner.
  details: string[];
}

// contentful-management normally wraps API errors as an Error whose `.message` is the raw
// JSON response body, but calls proxied through the app iframe's postMessage bridge (as
// sdk.cma is) can arrive as a plain object instead of a real Error instance - handle both,
// and pull the human-readable `message` field out of any JSON we find along the way.
const extractErrorMessage = (err: unknown): ExtractedError => {
  if (typeof err === 'string') return { message: err, details: [] };

  const rawMessage = err instanceof Error ? err.message : (err as { message?: unknown })?.message;

  if (typeof rawMessage === 'string') {
    try {
      const parsed = JSON.parse(rawMessage);
      if (typeof parsed?.message !== 'string') return { message: rawMessage, details: [] };

      // Contentful's top-level message is a generic label ("Validation error") - the actual
      // reason(s) live in details.errors[], e.g. { details: 'The property "columns" is required here' }.
      const detailErrors: string[] = Array.isArray(parsed?.details?.errors)
        ? parsed.details.errors.map((e: { details?: string }) => e?.details).filter(Boolean)
        : [];

      if (detailErrors.length === 0) return { message: parsed.message, details: [] };
      if (detailErrors.length === 1) return { message: `${parsed.message}: ${detailErrors[0]}`, details: [] };
      return { message: parsed.message, details: detailErrors };
    } catch {
      return { message: rawMessage, details: [] };
    }
  }

  if (err && typeof err === 'object') {
    try {
      return { message: JSON.stringify(err), details: [] };
    } catch {
      // fall through
    }
  }

  return { message: 'Unknown error', details: [] };
};

const ErrorNote = ({ prefix, error }: { prefix: string; error: ExtractedError }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <Note variant="negative">
      {prefix}: {error.message}
      {error.details.length > 0 && (
        <>
          {' '}
          <TextLink as="button" onClick={() => setShowDetails(v => !v)}>
            {showDetails ? 'Hide details' : 'Show details'}
          </TextLink>
          {showDetails && (
            <ul>
              {error.details.map((detail, index) => (
                <li key={index}>
                  <Text fontSize="fontSizeS">{detail}</Text>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Note>
  );
};

const Sidebar = () => {
  const sdk = useSDK<SidebarAppSDK>();
  useAutoResizer();

  const [pendingAction, setPendingAction] = useState<DialogMode | null>(null);
  const [result, setResult] = useState<{ action: DialogMode; locales: string[] } | null>(null);
  const [actionError, setActionError] = useState<{ action: DialogMode; error: ExtractedError } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [entryStatus, setEntryStatus] = useState(() => getEntryStatus(sdk.entry.getSys()));

  useEffect(() => {
    // Keeps the badge live - most importantly, flips straight to "published" right after this
    // app's own Publish button succeeds, with no page refresh needed.
    return sdk.entry.onSysChanged(sys => setEntryStatus(getEntryStatus(sys)));
  }, [sdk]);

  const [scheduledActions, setScheduledActions] = useState<ScheduledEntryAction[]>([]);
  const [scheduleAction, setScheduleAction] = useState<ScheduledActionType>('publish');
  const [scheduleInput, setScheduleInput] = useState('');
  const [scheduleError, setScheduleError] = useState<ExtractedError | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);

  const refreshScheduledActions = useCallback(async () => {
    try {
      const items = await listScheduledActions(sdk.cma, sdk.ids.environment, sdk.ids.entry);
      setScheduledActions(items);
    } catch {
      // Non-critical - the schedule/cancel controls still work without the list loading.
    }
  }, [sdk]);

  useEffect(() => {
    refreshScheduledActions();
  }, [refreshScheduledActions]);

  const handleScheduleAction = async () => {
    if (!scheduleInput) return;

    setIsScheduling(true);
    setScheduleError(null);
    try {
      const datetime = new Date(scheduleInput).toISOString();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await createScheduledAction(sdk.cma, sdk.ids.environment, sdk.ids.entry, scheduleAction, datetime, timezone);
      setScheduleInput('');
      await refreshScheduledActions();
    } catch (err) {
      setScheduleError(extractErrorMessage(err));
    } finally {
      setIsScheduling(false);
    }
  };

  const handleCancelScheduledAction = async (scheduledActionId: string) => {
    setScheduleError(null);
    try {
      await cancelScheduledAction(sdk.cma, sdk.ids.environment, scheduledActionId);
      await refreshScheduledActions();
    } catch (err) {
      setScheduleError(extractErrorMessage(err));
    }
  };

  const parameters = sdk.parameters.installation as AppInstallationParameters;
  const spaceLocales = sdk.locales.available;
  const localeNames = sdk.locales.names;

  const allowedLocales = useMemo(
    () => getAllowedLocales(sdk.user.spaceMembership, parameters, spaceLocales),
    [sdk.user.spaceMembership, parameters, spaceLocales]
  );

  const excludedLocales = spaceLocales.filter(locale => !allowedLocales.includes(locale));

  const runLocaleAction = async (action: DialogMode) => {
    setNotice(null);
    const localeStatus = await getLocaleStatuses(sdk.cma, sdk.ids.entry, [
      ...allowedLocales,
      ...excludedLocales,
    ]);

    // For unpublish, only regions that are actually live can be picked; the user's never-
    // published regions join the other teams' ones under "Not affected". A locale reads as
    // `draft` only when the status fetch succeeded and says so - if it failed, the map is
    // empty and every allowed locale stays pickable rather than hiding the whole list.
    const dialogLocales =
      action === 'publish'
        ? allowedLocales
        : allowedLocales.filter(locale => localeStatus[locale] !== 'draft');
    // Every locale live right now, across all teams. Empty when the status fetch failed.
    const liveLocales = spaceLocales.filter(
      locale => localeStatus[locale] && localeStatus[locale] !== 'draft'
    );

    if (dialogLocales.length === 0) {
      setNotice("None of your regions are currently published, so there's nothing to unpublish.");
      return;
    }

    // Mirrors the native Publish button's review step: the user sees exactly which of
    // their regions are about to change and can narrow the selection before confirming.
    const selectedLocales = await sdk.dialogs.openCurrentApp({
      title: actionCopy[action].title,
      width: 'small',
      minHeight: 450,
      allowHeightOverflow: true,
      parameters: {
        ...(action === 'unpublish' && {
          mode: action,
          defaultLocale: sdk.locales.default,
          liveLocales,
        }),
        allowedLocales: dialogLocales,
        excludedLocales: spaceLocales.filter(locale => !dialogLocales.includes(locale)),
        localeStatus,
        localeNames,
      },
    });

    if (!selectedLocales || selectedLocales.length === 0) {
      return;
    }

    setPendingAction(action);
    setResult(null);
    setActionError(null);
    try {
      const { version } = sdk.entry.getSys();
      const takesDownEverything =
        liveLocales.length > 0 && liveLocales.every(locale => selectedLocales.includes(locale));

      if (action === 'publish') {
        await publishLocales(sdk.cma, sdk.ids.entry, version, selectedLocales);
      } else if (takesDownEverything) {
        await unpublishEntry(sdk.cma, sdk.ids.entry);
      } else {
        await unpublishLocales(sdk.cma, sdk.ids.entry, version, selectedLocales);
      }
      setResult({ action, locales: selectedLocales });
    } catch (err) {
      setActionError({ action, error: extractErrorMessage(err) });
    } finally {
      setPendingAction(null);
    }
  };

  if (allowedLocales.length === 0) {
    return (
      <Note variant="warning">
        Your role isn't configured to publish any locales for this space. Contact an admin to
        update the Regional Publishing app configuration.
      </Note>
    );
  }

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Flex justifyContent="space-between" alignItems="center">
        <Subheading marginBottom="none">Regional Publishing</Subheading>
        <EntityStatusBadge entityStatus={entryStatus} />
      </Flex>
      <Flex flexDirection="column" gap="spacingXs">
        <Button
          variant="positive"
          isFullWidth
          isDisabled={pendingAction !== null}
          isLoading={pendingAction === 'publish'}
          onClick={() => runLocaleAction('publish')}
        >
          Publish
        </Button>
        <Button
          variant="secondary"
          isFullWidth
          // `draft`/`archived` means no locale is live, so there's nothing to take down.
          isDisabled={pendingAction !== null || entryStatus === 'draft' || entryStatus === 'archived'}
          isLoading={pendingAction === 'unpublish'}
          onClick={() => runLocaleAction('unpublish')}
        >
          Unpublish
        </Button>
      </Flex>
      {notice && <Note variant="neutral">{notice}</Note>}
      {result && (
        <Note variant="positive">
          {actionCopy[result.action].done} {result.locales.join(', ')}.
        </Note>
      )}
      {actionError && <ErrorNote prefix={actionCopy[actionError.action].failed} error={actionError.error} />}

      <Flex flexDirection="column" gap="spacingXs">
        <Text fontWeight="fontWeightDemiBold">Scheduled actions</Text>
        <Text fontSize="fontSizeS" fontColor="gray500">
          Publishes or unpublishes every region at once - it can&apos;t be scoped to just yours.
        </Text>
        {scheduledActions.map(scheduled => (
          <Flex key={scheduled.id} justifyContent="space-between" alignItems="center" gap="spacingXs">
            <Text fontSize="fontSizeS">
              {scheduled.action === 'publish' ? 'Publish' : 'Unpublish'} · {new Date(scheduled.datetime).toLocaleString()}
            </Text>
            <Button size="small" variant="secondary" onClick={() => handleCancelScheduledAction(scheduled.id)}>
              Unschedule
            </Button>
          </Flex>
        ))}
        <Flex flexDirection="column" gap="spacingXs">
          <Select
            size="small"
            value={scheduleAction}
            onChange={e => setScheduleAction(e.target.value as ScheduledActionType)}
          >
            <Select.Option value="publish">Publish</Select.Option>
            <Select.Option value="unpublish">Unpublish</Select.Option>
          </Select>
          <TextInput
            type="datetime-local"
            size="small"
            value={scheduleInput}
            onChange={e => setScheduleInput(e.target.value)}
          />
          <Button
            size="small"
            isFullWidth
            isDisabled={!scheduleInput || isScheduling}
            isLoading={isScheduling}
            onClick={handleScheduleAction}
          >
            Schedule
          </Button>
        </Flex>
        {scheduleError && <ErrorNote prefix="Schedule failed" error={scheduleError} />}
      </Flex>
    </Flex>
  );
};

export default Sidebar;
