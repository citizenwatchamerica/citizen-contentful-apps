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

  it('surfaces the specific field/locale reason from a Contentful validation error, not just the generic label', async () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };
    mockSdk.dialogs.openCurrentApp.mockResolvedValue(['en-US']);
    mockSdk.cma.entry.publish.mockRejectedValueOnce(
      new Error(
        JSON.stringify({
          message: 'Validation error',
          details: { errors: [{ name: 'required', path: ['fields', 'columns'], details: 'The property "columns" is required here' }] },
        })
      )
    );

    const { getByText, getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Publish' }));

    await waitFor(() =>
      expect(
        getByText('Publish failed: Validation error: The property "columns" is required here')
      ).toBeTruthy()
    );
  });

  it('offers an expandable details view when Contentful reports more than one validation issue', async () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };
    mockSdk.dialogs.openCurrentApp.mockResolvedValue(['en-US']);
    mockSdk.cma.entry.publish.mockRejectedValueOnce(
      new Error(
        JSON.stringify({
          message: 'Validation error',
          details: {
            errors: [
              { details: 'The property "columns" is required here' },
              { details: 'The property "fr-CA" is required here' },
            ],
          },
        })
      )
    );

    const { getByText, getByRole, queryByText } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(getByText('Publish failed: Validation error')).toBeTruthy());
    expect(queryByText('The property "columns" is required here')).toBeNull();

    fireEvent.click(getByText('Show details'));
    expect(getByText('The property "columns" is required here')).toBeTruthy();
    expect(getByText('The property "fr-CA" is required here')).toBeTruthy();

    fireEvent.click(getByText('Hide details'));
    expect(queryByText('The property "columns" is required here')).toBeNull();
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

  it('disables Unpublish while the entry has never been published', () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };
    mockSdk.entry.getSys.mockReturnValue({ version: 1 });

    const { getByRole } = render(<Sidebar />);
    expect(getByRole('button', { name: 'Unpublish' })).toHaveProperty('disabled', true);
  });

  it('offers only the published regions for unpublish, then unpublishes what the dialog returns', async () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [{ name: 'NA Editor' }] };
    mockSdk.parameters.installation = { roleLocaleMap: { 'NA Editor': ['en-US', 'en-GB'] } };
    mockSdk.locales.available = ['en-US', 'en-GB', 'fr-FR'];
    mockSdk.entry.getSys.mockReturnValue({ version: 5, publishedVersion: 4 });
    mockSdk.cma.entry.get.mockResolvedValueOnce({
      sys: { fieldStatus: { '*': { 'en-US': 'published', 'fr-FR': 'changed' } } },
    });
    mockSdk.cma.entry.unpublish.mockClear();
    mockSdk.dialogs.openCurrentApp.mockResolvedValue(['en-US']);

    const { getByText, getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Unpublish' }));

    await waitFor(() => expect(mockSdk.dialogs.openCurrentApp).toHaveBeenCalledTimes(1));
    expect(mockSdk.dialogs.openCurrentApp).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unpublish regions',
        parameters: expect.objectContaining({
          mode: 'unpublish',
          allowedLocales: ['en-US'],
          excludedLocales: ['en-GB', 'fr-FR'],
        }),
      })
    );

    await waitFor(() => expect(getByText('Unpublished en-US.')).toBeTruthy());
    expect(mockSdk.cma.entry.unpublish).toHaveBeenCalledWith(
      { entryId: 'test-entry', locales: ['en-US'] },
      { sys: { id: 'test-entry', type: 'Entry', version: 5 } }
    );
    expect(mockSdk.cma.entry.publish).not.toHaveBeenCalled();
    mockSdk.locales.available = ['en-US', 'en-GB'];
  });

  it('unpublishes the whole entry when the selection covers every live locale', async () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };
    mockSdk.entry.getSys.mockReturnValue({ version: 5, publishedVersion: 4 });
    mockSdk.cma.entry.get.mockResolvedValueOnce({
      sys: { fieldStatus: { '*': { 'en-US': 'published', 'en-GB': 'changed' } } },
    });
    mockSdk.cma.entry.unpublish.mockClear();
    mockSdk.dialogs.openCurrentApp.mockResolvedValue(['en-US', 'en-GB']);

    const { getByText, getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Unpublish' }));

    await waitFor(() => expect(getByText('Unpublished en-US, en-GB.')).toBeTruthy());
    expect(mockSdk.dialogs.openCurrentApp).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: expect.objectContaining({ defaultLocale: 'en-US', liveLocales: ['en-US', 'en-GB'] }),
      })
    );
    expect(mockSdk.cma.entry.unpublish).toHaveBeenCalledWith({ entryId: 'test-entry' });
  });

  it("explains instead of opening the dialog when none of the user's regions are published", async () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [{ name: 'US Editor' }] };
    mockSdk.parameters.installation = { roleLocaleMap: { 'US Editor': ['en-US'] } };
    mockSdk.entry.getSys.mockReturnValue({ version: 5, publishedVersion: 4 });
    mockSdk.cma.entry.get.mockResolvedValueOnce({ sys: { fieldStatus: { '*': { 'en-GB': 'published' } } } });

    const { getByText, getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Unpublish' }));

    await waitFor(() => expect(getByText(/nothing to unpublish/)).toBeTruthy());
    expect(mockSdk.dialogs.openCurrentApp).not.toHaveBeenCalled();
  });

  it('shows the real error message when unpublish is rejected', async () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };
    mockSdk.entry.getSys.mockReturnValue({ version: 5, publishedVersion: 4 });
    mockSdk.cma.entry.get.mockResolvedValueOnce({ sys: { fieldStatus: { '*': { 'en-US': 'published' } } } });
    mockSdk.dialogs.openCurrentApp.mockResolvedValue(['en-US']);
    mockSdk.cma.entry.unpublish.mockRejectedValueOnce(new Error('{"message":"Default locale required"}'));

    const { getByText, getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Unpublish' }));

    await waitFor(() => expect(getByText('Unpublish failed: Default locale required')).toBeTruthy());
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
