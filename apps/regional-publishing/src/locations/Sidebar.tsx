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
} from '@contentful/f36-components';
import { useAutoResizer, useSDK } from '@contentful/react-apps-toolkit';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEntryStatus } from '../utils/entryStatus';
import { getLocaleStatuses } from '../utils/localeStatus';
import { AppInstallationParameters, getAllowedLocales } from '../utils/permissions';
import { publishLocales } from '../utils/publishLocales';
import {
  cancelScheduledAction,
  createScheduledAction,
  listScheduledActions,
  ScheduledActionType,
  ScheduledEntryAction,
} from '../utils/scheduledActions';

type Status = 'idle' | 'publishing' | 'success' | 'error';

// contentful-management normally wraps API errors as an Error whose `.message` is the raw
// JSON response body, but calls proxied through the app iframe's postMessage bridge (as
// sdk.cma is) can arrive as a plain object instead of a real Error instance - handle both,
// and pull the human-readable `message` field out of any JSON we find along the way.
const extractErrorMessage = (err: unknown): string => {
  if (typeof err === 'string') return err;

  const rawMessage = err instanceof Error ? err.message : (err as { message?: unknown })?.message;

  if (typeof rawMessage === 'string') {
    try {
      const parsed = JSON.parse(rawMessage);
      return typeof parsed?.message === 'string' ? parsed.message : rawMessage;
    } catch {
      return rawMessage;
    }
  }

  if (err && typeof err === 'object') {
    try {
      return JSON.stringify(err);
    } catch {
      // fall through
    }
  }

  return 'Unknown error';
};

const Sidebar = () => {
  const sdk = useSDK<SidebarAppSDK>();
  useAutoResizer();

  const [status, setStatus] = useState<Status>('idle');
  const [publishedLocales, setPublishedLocales] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [entryStatus, setEntryStatus] = useState(() => getEntryStatus(sdk.entry.getSys()));

  useEffect(() => {
    // Keeps the badge live - most importantly, flips straight to "published" right after this
    // app's own Publish button succeeds, with no page refresh needed.
    return sdk.entry.onSysChanged(sys => setEntryStatus(getEntryStatus(sys)));
  }, [sdk]);

  const [scheduledActions, setScheduledActions] = useState<ScheduledEntryAction[]>([]);
  const [scheduleAction, setScheduleAction] = useState<ScheduledActionType>('publish');
  const [scheduleInput, setScheduleInput] = useState('');
  const [scheduleError, setScheduleError] = useState('');
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
    setScheduleError('');
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
    setScheduleError('');
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

  const handlePublish = async () => {
    const localeStatus = await getLocaleStatuses(sdk.cma, sdk.ids.entry, [
      ...allowedLocales,
      ...excludedLocales,
    ]);

    // Mirrors the native Publish button's review step: the user sees exactly which of
    // their regions are about to go out and can narrow the selection before confirming.
    const selectedLocales = await sdk.dialogs.openCurrentApp({
      title: 'Publish regions',
      width: 'small',
      minHeight: 450,
      allowHeightOverflow: true,
      parameters: { allowedLocales, excludedLocales, localeStatus, localeNames },
    });

    if (!selectedLocales || selectedLocales.length === 0) {
      return;
    }

    setStatus('publishing');
    try {
      const { version } = sdk.entry.getSys();
      await publishLocales(sdk.cma, sdk.ids.entry, version, selectedLocales);
      setPublishedLocales(selectedLocales);
      setStatus('success');
    } catch (err) {
      setErrorMessage(extractErrorMessage(err));
      setStatus('error');
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
      <Button
        variant="positive"
        isFullWidth
        isDisabled={status === 'publishing'}
        isLoading={status === 'publishing'}
        onClick={handlePublish}
      >
        Publish
      </Button>
      {status === 'success' && <Note variant="positive">Published {publishedLocales.join(', ')}.</Note>}
      {status === 'error' && <Note variant="negative">Publish failed: {errorMessage}</Note>}

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
        {scheduleError && <Note variant="negative">{scheduleError}</Note>}
      </Flex>
    </Flex>
  );
};

export default Sidebar;
