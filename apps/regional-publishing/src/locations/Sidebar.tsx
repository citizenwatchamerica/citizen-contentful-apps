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
import { getLinkedContent, LinkedContent } from '../utils/linkedContent';
import { getLocaleStatuses } from '../utils/localeStatus';
import { isSharedOutsideTeam, LinkType } from '../utils/ownership';
import { AppInstallationParameters, getAllowedLocales, getOwningRoles } from '../utils/permissions';
import { publishAssetLocales, publishLocales } from '../utils/publishLocales';
import { unpublishEntry, unpublishLocales } from '../utils/unpublishLocales';
import type { DialogMode, PublishSelection } from './Dialog';
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
  const [result, setResult] = useState<{ action: DialogMode; locales: string[]; linkedCount: number } | null>(
    null
  );
  const [linkedProblems, setLinkedProblems] = useState<string[]>([]);
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

    // Contentful rejects an entry's first publish unless it includes the default locale, so it's
    // locked in for that publish. A regional team gets it for entries the team owns - created by
    // the editor or a teammate on the same role, and not linked from other teams' content in a
    // locale the team doesn't own - required on the first publish, optional after that.
    // A content type with no localized fields keeps all its content under the default locale,
    // so it's shared by every region: any editor publishes it with the default locale, every time.
    const defaultLocale = sdk.locales.default;
    const { publishedVersion, createdBy } = sdk.entry.getSys();
    const isFirstPublish = !publishedVersion;
    const isSharedContentType = !sdk.contentType.fields.some(field => field.localized);
    const canPublishDefault = allowedLocales.includes(defaultLocale);

    const teamOwns = async (creatorId: string | undefined, entityId: string, linkType: LinkType) => {
      const owningRoles = getOwningRoles(sdk.user.spaceMembership, parameters, creatorId, sdk.user.sys.id);
      const teamLocales = owningRoles.flatMap(roleName => parameters?.roleLocaleMap?.[roleName] ?? []);
      const isTeamMember = (userId: string | undefined) =>
        !!userId &&
        (userId === sdk.user.sys.id ||
          owningRoles.some(roleName => (parameters?.roleMembers?.[roleName] ?? []).includes(userId)));

      return (
        owningRoles.length > 0 &&
        !(await isSharedOutsideTeam(sdk.cma, entityId, teamLocales, isTeamMember, linkType))
      );
    };

    const teamOwnsEntry =
      action === 'publish' &&
      !isSharedContentType &&
      !canPublishDefault &&
      (await teamOwns(createdBy?.sys.id, sdk.ids.entry, 'Entry'));

    const requiredLocales =
      action === 'publish' &&
      (isSharedContentType || (isFirstPublish && (canPublishDefault || teamOwnsEntry)))
        ? [defaultLocale]
        : [];
    const optionalLocales = action === 'publish' && !isFirstPublish && teamOwnsEntry ? [defaultLocale] : [];

    if (action === 'publish' && isFirstPublish && requiredLocales.length === 0) {
      setNotice(
        `This entry has never been published, and its first publish has to include ${
          localeNames[defaultLocale] ?? defaultLocale
        }. That's only available to your team for entries it created that aren't shared with other regions, so ask an admin or the owning team to publish it first.`
      );
      return;
    }

    // For unpublish, only regions that are actually live can be picked; the user's never-
    // published regions join the other teams' ones under "Not affected". A locale reads as
    // `draft` only when the status fetch succeeded and says so - if it failed, the map is
    // empty and every allowed locale stays pickable rather than hiding the whole list.
    const dialogLocales =
      action === 'publish'
        ? spaceLocales.filter(
            locale =>
              allowedLocales.includes(locale) ||
              requiredLocales.includes(locale) ||
              optionalLocales.includes(locale)
          )
        : allowedLocales.filter(locale => localeStatus[locale] !== 'draft');
    // Every locale live right now, across all teams. Empty when the status fetch failed.
    const liveLocales = spaceLocales.filter(
      locale => localeStatus[locale] && localeStatus[locale] !== 'draft'
    );

    if (dialogLocales.length === 0) {
      setNotice("None of your regions are currently published, so there's nothing to unpublish.");
      return;
    }

    // Draft/changed entries and media this entry links to, so they can go live with it instead of
    // leaving the published entry pointing at drafts.
    let linkedContent: LinkedContent = { items: [], rootSharedFieldChanges: [], incomplete: false };
    if (action === 'publish') {
      setPendingAction('publish');
      linkedContent = await getLinkedContent(
        sdk.cma,
        sdk.ids.entry,
        sdk.contentType.fields.filter(field => field.localized).map(field => field.id),
        { locales: dialogLocales, defaultLocale, fallbacks: sdk.locales.fallbacks ?? {} }
      );
      setPendingAction(null);
    }

    // Mirrors the native Publish button's review step: the user sees exactly which of
    // their regions are about to change and can narrow the selection before confirming.
    const selection: PublishSelection | string[] | null = await sdk.dialogs.openCurrentApp({
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
        ...(requiredLocales.length > 0 && { requiredLocales }),
        ...(optionalLocales.length > 0 && { optionalLocales }),
        ...(linkedContent.items.length > 0 && {
          linkedItems: linkedContent.items,
          fieldNames: Object.fromEntries(sdk.contentType.fields.map(field => [field.id, field.name])),
        }),
        ...(linkedContent.incomplete && { linkedIncomplete: true }),
        ...(linkedContent.rootSharedFieldChanges.length > 0 && {
          sharedFieldChanges: linkedContent.rootSharedFieldChanges,
          defaultLocale,
        }),
        allowedLocales: dialogLocales,
        excludedLocales: spaceLocales.filter(locale => !dialogLocales.includes(locale)),
        localeStatus,
        localeNames,
      },
    });

    const selectedLocales = Array.isArray(selection) ? selection : selection?.locales;
    if (!selectedLocales || selectedLocales.length === 0) {
      return;
    }
    const selectedLinkedIds = Array.isArray(selection) ? [] : selection?.linkedIds ?? [];

    setPendingAction(action);
    setResult(null);
    setActionError(null);
    setLinkedProblems([]);
    try {
      const { version } = sdk.entry.getSys();
      const takesDownEverything =
        liveLocales.length > 0 && liveLocales.every(locale => selectedLocales.includes(locale));

      let linkedCount = 0;
      if (action === 'publish') {
        // Deepest first, so nothing goes live pointing at a draft. A linked item that fails is
        // reported but doesn't stop the rest - Contentful lets an entry link to unpublished content.
        const problems: string[] = [];
        const linkedToPublish = linkedContent.items
          .filter(item => selectedLinkedIds.includes(item.id))
          .reverse();

        for (const item of linkedToPublish) {
          // Same default-locale rule as the entry itself: needed on a first publish and for content
          // types with no localized fields - and for changed shared fields, which live under it.
          let locales = selectedLocales;
          const needsDefault =
            item.isFirstPublish || item.isSharedContentType || item.sharedFieldChanges.length > 0;
          if (needsDefault && !locales.includes(defaultLocale)) {
            const mayAddDefault =
              item.isSharedContentType || canPublishDefault || (await teamOwns(item.createdBy ?? undefined, item.id, item.type));
            if (!mayAddDefault) {
              const reason = item.isFirstPublish
                ? 'has never been published and needs'
                : `has changes to shared fields (${item.sharedFieldChanges.join(', ')}) that only go live with`;
              problems.push(
                `${item.title}: ${reason} ${
                  localeNames[defaultLocale] ?? defaultLocale
                }, which only its owning team or an admin can publish.`
              );
              continue;
            }
            locales = [defaultLocale, ...locales];
          }

          try {
            if (item.type === 'Asset') {
              await publishAssetLocales(sdk.cma, item.id, item.version, locales);
            } else {
              await publishLocales(sdk.cma, item.id, item.version, locales);
            }
            linkedCount++;
          } catch (err) {
            problems.push(`${item.title}: ${extractErrorMessage(err).message}`);
          }
        }
        setLinkedProblems(problems);

        await publishLocales(sdk.cma, sdk.ids.entry, version, selectedLocales);
      } else if (takesDownEverything) {
        await unpublishEntry(sdk.cma, sdk.ids.entry);
      } else {
        await unpublishLocales(sdk.cma, sdk.ids.entry, version, selectedLocales);
      }
      setResult({ action, locales: selectedLocales, linkedCount });
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
          {result.linkedCount > 0 &&
            ` Also published ${result.linkedCount} linked item${result.linkedCount === 1 ? '' : 's'}.`}
        </Note>
      )}
      {linkedProblems.length > 0 && (
        <Note variant="warning">
          Some linked content wasn&apos;t published:
          <ul>
            {linkedProblems.map(problem => (
              <li key={problem}>
                <Text fontSize="fontSizeS">{problem}</Text>
              </li>
            ))}
          </ul>
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
