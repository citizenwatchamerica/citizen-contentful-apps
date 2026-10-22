import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockCma, mockSdk } from '../../test/mocks';
import ConfigScreen from './ConfigScreen';

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
}));

describe('Config Screen component', () => {
  afterEach(cleanup);

  it('renders one section per space role with a checkbox per locale', async () => {
    mockCma.role.getMany.mockResolvedValueOnce({
      items: [{ sys: { id: 'role-us' }, name: 'US Editor' }],
    });

    const { findByText, getByLabelText } = render(<ConfigScreen />);

    await findByText('US Editor');
    expect(getByLabelText('en-US')).toBeTruthy();
    expect(getByLabelText('en-GB')).toBeTruthy();
  });

  it('saves the toggled role/locale map on configure, keeping the synced role members', async () => {
    mockSdk.app.getParameters.mockReturnValueOnce({
      roleLocaleMap: {},
      roleMembers: { 'US Editor': ['user-1', 'user-2'] },
    });
    mockCma.role.getMany.mockResolvedValueOnce({
      items: [{ sys: { id: 'role-us' }, name: 'US Editor' }],
    });

    const { findByLabelText, getByText } = render(<ConfigScreen />);
    const checkbox = (await findByLabelText('en-US')) as HTMLInputElement;
    checkbox.click();
    expect(getByText('2 members recorded')).toBeTruthy();

    // onConfigure closes over roleLocaleMap state, so it's re-registered on every change —
    // grab the most recently registered callback, not the first.
    const calls = mockSdk.app.onConfigure.mock.calls;
    const result = await calls[calls.length - 1][0]();
    expect(result.parameters).toEqual({
      roleLocaleMap: { 'US Editor': ['en-US'] },
      roleMembers: { 'US Editor': ['user-1', 'user-2'] },
    });
  });
});
