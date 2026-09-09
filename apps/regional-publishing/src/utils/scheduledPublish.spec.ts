import { describe, expect, it, vi } from 'vitest';
import { cancelScheduledPublish, listScheduledPublishes, schedulePublish } from './scheduledPublish';

describe('listScheduledPublishes', () => {
  it('queries by environment and entity, and only returns publish actions', async () => {
    const cma: any = {
      scheduledActions: {
        getMany: vi.fn().mockResolvedValue({
          items: [
            { sys: { id: 'a' }, action: 'publish', scheduledFor: { datetime: '2026-01-01T00:00:00Z', timezone: 'UTC' } },
            { sys: { id: 'b' }, action: 'unpublish', scheduledFor: { datetime: '2026-01-02T00:00:00Z' } },
          ],
        }),
      },
    };

    const result = await listScheduledPublishes(cma, 'master', 'entry-1');

    expect(cma.scheduledActions.getMany).toHaveBeenCalledWith({
      query: {
        'environment.sys.id': 'master',
        'entity.sys.id': 'entry-1',
        'sys.status[in]': 'scheduled',
        order: '-sys.scheduledFor.datetime',
      },
    });
    expect(result).toEqual([{ id: 'a', datetime: '2026-01-01T00:00:00Z', timezone: 'UTC' }]);
  });
});

describe('schedulePublish', () => {
  it('creates a whole-entry publish scheduled action', async () => {
    const cma: any = { scheduledActions: { create: vi.fn().mockResolvedValue({}) } };

    await schedulePublish(cma, 'master', 'entry-1', '2026-01-01T00:00:00Z', 'America/New_York');

    expect(cma.scheduledActions.create).toHaveBeenCalledWith(
      {},
      {
        entity: { sys: { type: 'Link', linkType: 'Entry', id: 'entry-1' } },
        environment: { sys: { type: 'Link', linkType: 'Environment', id: 'master' } },
        action: 'publish',
        scheduledFor: { datetime: '2026-01-01T00:00:00Z', timezone: 'America/New_York' },
      }
    );
  });
});

describe('cancelScheduledPublish', () => {
  it('deletes the scheduled action by id and environment', async () => {
    const cma: any = { scheduledActions: { delete: vi.fn().mockResolvedValue({}) } };

    await cancelScheduledPublish(cma, 'master', 'scheduled-1');

    expect(cma.scheduledActions.delete).toHaveBeenCalledWith({
      scheduledActionId: 'scheduled-1',
      environmentId: 'master',
    });
  });
});
