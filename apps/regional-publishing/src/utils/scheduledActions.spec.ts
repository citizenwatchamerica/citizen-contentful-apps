import { describe, expect, it, vi } from 'vitest';
import { cancelScheduledAction, createScheduledAction, listScheduledActions } from './scheduledActions';

describe('listScheduledActions', () => {
  it('queries by environment and entity, and returns publish/unpublish actions', async () => {
    const cma: any = {
      scheduledActions: {
        getMany: vi.fn().mockResolvedValue({
          items: [
            { sys: { id: 'a' }, action: 'publish', scheduledFor: { datetime: '2026-01-01T00:00:00Z', timezone: 'UTC' } },
            { sys: { id: 'b' }, action: 'unpublish', scheduledFor: { datetime: '2026-01-02T00:00:00Z', timezone: 'UTC' } },
          ],
        }),
      },
    };

    const result = await listScheduledActions(cma, 'master', 'entry-1');

    expect(cma.scheduledActions.getMany).toHaveBeenCalledWith({
      query: {
        'environment.sys.id': 'master',
        'entity.sys.id': 'entry-1',
        'sys.status[in]': 'scheduled',
        order: '-sys.scheduledFor.datetime',
      },
    });
    expect(result).toEqual([
      { id: 'a', action: 'publish', datetime: '2026-01-01T00:00:00Z', timezone: 'UTC' },
      { id: 'b', action: 'unpublish', datetime: '2026-01-02T00:00:00Z', timezone: 'UTC' },
    ]);
  });
});

describe('createScheduledAction', () => {
  it('creates a whole-entry publish scheduled action', async () => {
    const cma: any = { scheduledActions: { create: vi.fn().mockResolvedValue({}) } };

    await createScheduledAction(cma, 'master', 'entry-1', 'publish', '2026-01-01T00:00:00Z', 'America/New_York');

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

  it('creates a whole-entry unpublish scheduled action', async () => {
    const cma: any = { scheduledActions: { create: vi.fn().mockResolvedValue({}) } };

    await createScheduledAction(cma, 'master', 'entry-1', 'unpublish', '2026-01-01T00:00:00Z', 'America/New_York');

    expect(cma.scheduledActions.create).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ action: 'unpublish' })
    );
  });
});

describe('cancelScheduledAction', () => {
  it('deletes the scheduled action by id and environment', async () => {
    const cma: any = { scheduledActions: { delete: vi.fn().mockResolvedValue({}) } };

    await cancelScheduledAction(cma, 'master', 'scheduled-1');

    expect(cma.scheduledActions.delete).toHaveBeenCalledWith({
      scheduledActionId: 'scheduled-1',
      environmentId: 'master',
    });
  });
});
