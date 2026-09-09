import type { CMAClient } from '@contentful/app-sdk';

export interface ScheduledPublish {
  id: string;
  datetime: string;
  timezone?: string;
}

// Scheduled Actions are a space-level resource (not auto-scoped to the current entry/environment
// the way sdk.cma.entry.* calls are), so every call here has to name the environment explicitly.
export const listScheduledPublishes = async (
  cma: CMAClient,
  environmentId: string,
  entryId: string
): Promise<ScheduledPublish[]> => {
  const result = await cma.scheduledActions.getMany({
    query: {
      'environment.sys.id': environmentId,
      'entity.sys.id': entryId,
      'sys.status[in]': 'scheduled',
      order: '-sys.scheduledFor.datetime',
    },
  });

  return result.items
    .filter(item => item.action === 'publish')
    .map(item => ({
      id: item.sys.id,
      datetime: item.scheduledFor.datetime,
      timezone: item.scheduledFor.timezone,
    }));
};

// Whole-entry only: Contentful's Scheduled Actions API rejects a `locales`/`payload.locales`
// field outright ("not allowed") - selective-locale publish only exists for immediate publish,
// not scheduled. A scheduled publish here always publishes every locale on the entry, same as
// clicking the native Publish button would, just deferred to a later time.
export const schedulePublish = async (
  cma: CMAClient,
  environmentId: string,
  entryId: string,
  datetime: string,
  timezone: string
): Promise<void> => {
  await cma.scheduledActions.create(
    {},
    {
      entity: { sys: { type: 'Link', linkType: 'Entry', id: entryId } },
      environment: { sys: { type: 'Link', linkType: 'Environment', id: environmentId } },
      action: 'publish',
      scheduledFor: { datetime, timezone },
    }
  );
};

export const cancelScheduledPublish = async (
  cma: CMAClient,
  environmentId: string,
  scheduledActionId: string
): Promise<void> => {
  await cma.scheduledActions.delete({ scheduledActionId, environmentId });
};
