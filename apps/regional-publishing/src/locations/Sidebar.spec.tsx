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

  it('lists allowed and excluded locales for a scoped role', () => {
    mockSdk.user.spaceMembership = {
      admin: false,
      roles: [{ name: 'US Editor' }],
    };
    mockSdk.parameters.installation = { roleLocaleMap: { 'US Editor': ['en-US'] } };

    const { getByText } = render(<Sidebar />);
    expect(getByText("You're responsible for: en-US")).toBeTruthy();
    expect(getByText('Not affected by this publish: en-GB')).toBeTruthy();
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
        parameters: { allowedLocales: ['en-US'], excludedLocales: ['en-GB'] },
      })
    );

    await waitFor(() => expect(getByText('Published en-US.')).toBeTruthy());
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
