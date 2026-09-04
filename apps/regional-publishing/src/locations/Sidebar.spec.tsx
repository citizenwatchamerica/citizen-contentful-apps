import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockSdk } from '../../test/mocks';
import Sidebar from './Sidebar';

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
  useAutoResizer: () => {},
}));

describe('Sidebar component', () => {
  it('shows a warning when the user has no allowed locales', () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };

    const { getByText } = render(<Sidebar />);
    expect(getByText(/isn't configured to publish any locales/)).toBeTruthy();
  });

  it('lists allowed and excluded locales for a scoped role, all selected by default', () => {
    mockSdk.user.spaceMembership = {
      admin: false,
      roles: [{ name: 'US Editor' }],
    };
    mockSdk.parameters.installation = { roleLocaleMap: { 'US Editor': ['en-US'] } };

    const { getByText } = render(<Sidebar />);
    expect(getByText("You're responsible for: en-US")).toBeTruthy();
    expect(getByText('Not affected by this publish: en-GB')).toBeTruthy();
    expect(getByText('Publish all my regions (1)')).toBeTruthy();
  });

  it('defaults to every locale selected for an admin', () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };

    const { getByText } = render(<Sidebar />);
    expect(getByText("You're responsible for: en-US, en-GB")).toBeTruthy();
    expect(getByText('Publish all my regions (2)')).toBeTruthy();
  });

  it('narrows the publish button to just the regions the user unchecks down to', () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleLocaleMap: {} };

    const { getByText, container } = render(<Sidebar />);
    fireEvent.click(container.querySelector('#publish-en-GB')!);

    expect(getByText('Publish selected regions (1)')).toBeTruthy();
  });
});
