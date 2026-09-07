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

    const { getByText, queryByText } = render(<Sidebar />);
    expect(getByText('Publish')).toBeTruthy();
    expect(queryByText(/responsible for/)).toBeNull();
    expect(queryByText(/Not affected/)).toBeNull();
  });

  it('opens the review dialog with the allowed and excluded locales, then publishes what the dialog returns', async () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [{ name: 'US Editor' }] };
    mockSdk.parameters.installation = { roleLocaleMap: { 'US Editor': ['en-US'] } };
    mockSdk.dialogs.openCurrentApp.mockResolvedValue(['en-US']);

    const { getByText } = render(<Sidebar />);
    fireEvent.click(getByText('Publish'));

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

    const { getByText } = render(<Sidebar />);
    fireEvent.click(getByText('Publish'));

    await waitFor(() => expect(getByText('Publish failed: Validation failed')).toBeTruthy());
  });

  it('shows the real error message when the CMA call rejects with a plain object, not an Error', async () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };
    mockSdk.dialogs.openCurrentApp.mockResolvedValue(['en-US']);
    mockSdk.cma.entry.publish.mockRejectedValueOnce({ status: 422, message: 'Entry is invalid' });

    const { getByText } = render(<Sidebar />);
    fireEvent.click(getByText('Publish'));

    await waitFor(() => expect(getByText('Publish failed: Entry is invalid')).toBeTruthy());
  });

  it('does nothing when the dialog is cancelled', async () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };
    mockSdk.dialogs.openCurrentApp.mockResolvedValue(null);

    const { getByText, queryByText } = render(<Sidebar />);
    fireEvent.click(getByText('Publish'));

    await waitFor(() => expect(mockSdk.dialogs.openCurrentApp).toHaveBeenCalledTimes(1));
    expect(mockSdk.cma.entry.publish).not.toHaveBeenCalled();
    expect(queryByText(/Published/)).toBeNull();
  });
});
