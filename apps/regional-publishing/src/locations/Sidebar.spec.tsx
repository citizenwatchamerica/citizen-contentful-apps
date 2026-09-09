import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSdk } from '../../test/mocks';
import Sidebar from './Sidebar';

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
  useAutoResizer: () => {},
}));

describe('Sidebar component', () => {
  beforeEach(() => {
    mockSdk.dialogs.openCurrentApp.mockReset();
    mockSdk.cma.entry.publish.mockClear();
    mockSdk.entry.getSys.mockReturnValue({ version: 1 });
    mockSdk.entry.onSysChanged.mockReturnValue(() => {});
    mockSdk.cma.scheduledActions.getMany.mockReset().mockResolvedValue({ items: [] });
    mockSdk.cma.scheduledActions.create.mockReset().mockResolvedValue({ sys: { id: 'scheduled-1' } });
    mockSdk.cma.scheduledActions.delete.mockReset().mockResolvedValue({});
  });

  afterEach(cleanup);

  it('shows a warning when the user has no allowed locales', () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };

    const { getByText } = render(<Sidebar />);
    expect(getByText(/isn't configured to publish any locales/)).toBeTruthy();
  });

  it('renders just the Publish button for a scoped role, leaving the region breakdown to the dialog', () => {
    mockSdk.user.spaceMembership = {
      admin: false,
      roles: [{ name: 'US Editor' }],
    };
    mockSdk.parameters.installation = { roleLocaleMap: { 'US Editor': ['en-US'] } };

    const { getByRole, queryByText } = render(<Sidebar />);
    expect(getByRole('button', { name: 'Publish' })).toBeTruthy();
    expect(queryByText(/responsible for/)).toBeNull();
    expect(queryByText(/Not affected/)).toBeNull();
  });

  it('opens the review dialog with the allowed and excluded locales, then publishes what the dialog returns', async () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [{ name: 'US Editor' }] };
    mockSdk.parameters.installation = { roleLocaleMap: { 'US Editor': ['en-US'] } };
    mockSdk.dialogs.openCurrentApp.mockResolvedValue(['en-US']);

    const { getByText, getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(mockSdk.dialogs.openCurrentApp).toHaveBeenCalledTimes(1));
    expect(mockSdk.dialogs.openCurrentApp).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: {
          allowedLocales: ['en-US'],
          excludedLocales: ['en-GB'],
          localeStatus: { 'en-US': 'draft', 'en-GB': 'draft' },
          localeNames: { 'en-US': 'English (United States)', 'en-GB': 'English (United Kingdom)' },
        },
      })
    );

    await waitFor(() => expect(getByText('Published en-US.')).toBeTruthy());
  });

  it('shows the real error message when the CMA call rejects with a JSON-message Error', async () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };
    mockSdk.dialogs.openCurrentApp.mockResolvedValue(['en-US']);
    mockSdk.cma.entry.publish.mockRejectedValueOnce(new Error('{"message":"Validation failed"}'));

    const { getByText, getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(getByText('Publish failed: Validation failed')).toBeTruthy());
  });

  it('shows the real error message when the CMA call rejects with a plain object, not an Error', async () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };
    mockSdk.dialogs.openCurrentApp.mockResolvedValue(['en-US']);
    mockSdk.cma.entry.publish.mockRejectedValueOnce({ status: 422, message: 'Entry is invalid' });

    const { getByText, getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(getByText('Publish failed: Entry is invalid')).toBeTruthy());
  });

  it('does nothing when the dialog is cancelled', async () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };
    mockSdk.dialogs.openCurrentApp.mockResolvedValue(null);

    const { getByRole, queryByText } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(mockSdk.dialogs.openCurrentApp).toHaveBeenCalledTimes(1));
    expect(mockSdk.cma.entry.publish).not.toHaveBeenCalled();
    expect(queryByText(/Published/)).toBeNull();
  });

  it('lists existing scheduled actions for this entry', async () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [{ name: 'US Editor' }] };
    mockSdk.parameters.installation = { roleLocaleMap: { 'US Editor': ['en-US'] } };
    mockSdk.cma.scheduledActions.getMany.mockResolvedValue({
      items: [
        {
          sys: { id: 'scheduled-1' },
          action: 'publish',
          scheduledFor: { datetime: '2026-01-01T00:00:00.000Z', timezone: 'UTC' },
        },
      ],
    });

    const { getByText } = render(<Sidebar />);

    await waitFor(() => expect(mockSdk.cma.scheduledActions.getMany).toHaveBeenCalledWith({
      query: {
        'environment.sys.id': 'master',
        'entity.sys.id': 'test-entry',
        'sys.status[in]': 'scheduled',
        order: '-sys.scheduledFor.datetime',
      },
    }));
    await waitFor(() => expect(getByText('Unschedule')).toBeTruthy());
  });

  it('schedules a publish and refreshes the list', async () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [{ name: 'US Editor' }] };
    mockSdk.parameters.installation = { roleLocaleMap: { 'US Editor': ['en-US'] } };

    const { getByText, container } = render(<Sidebar />);
    await waitFor(() => expect(mockSdk.cma.scheduledActions.getMany).toHaveBeenCalledTimes(1));

    const input = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-06-01T09:30' } });
    fireEvent.click(getByText('Schedule'));

    await waitFor(() => expect(mockSdk.cma.scheduledActions.create).toHaveBeenCalledTimes(1));
    const [, data] = mockSdk.cma.scheduledActions.create.mock.calls[0];
    expect(data.action).toBe('publish');
    expect(data.entity).toEqual({ sys: { type: 'Link', linkType: 'Entry', id: 'test-entry' } });
    await waitFor(() => expect(mockSdk.cma.scheduledActions.getMany).toHaveBeenCalledTimes(2));
  });

  it('schedules an unpublish when selected from the action dropdown', async () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [{ name: 'US Editor' }] };
    mockSdk.parameters.installation = { roleLocaleMap: { 'US Editor': ['en-US'] } };

    const { getByText, getByRole, container } = render(<Sidebar />);
    await waitFor(() => expect(mockSdk.cma.scheduledActions.getMany).toHaveBeenCalledTimes(1));

    fireEvent.change(getByRole('combobox'), { target: { value: 'unpublish' } });
    const input = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-06-01T09:30' } });
    fireEvent.click(getByText('Schedule'));

    await waitFor(() => expect(mockSdk.cma.scheduledActions.create).toHaveBeenCalledTimes(1));
    const [, data] = mockSdk.cma.scheduledActions.create.mock.calls[0];
    expect(data.action).toBe('unpublish');
  });

  it('cancels a scheduled action', async () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [{ name: 'US Editor' }] };
    mockSdk.parameters.installation = { roleLocaleMap: { 'US Editor': ['en-US'] } };
    mockSdk.cma.scheduledActions.getMany.mockResolvedValue({
      items: [
        {
          sys: { id: 'scheduled-1' },
          action: 'publish',
          scheduledFor: { datetime: '2026-01-01T00:00:00.000Z', timezone: 'UTC' },
        },
      ],
    });

    const { getByText } = render(<Sidebar />);
    await waitFor(() => expect(getByText('Unschedule')).toBeTruthy());

    fireEvent.click(getByText('Unschedule'));

    await waitFor(() =>
      expect(mockSdk.cma.scheduledActions.delete).toHaveBeenCalledWith({
        scheduledActionId: 'scheduled-1',
        environmentId: 'master',
      })
    );
  });
});
