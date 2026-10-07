import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSdk } from '../../test/mocks';
import ConfigScreen from './ConfigScreen';

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
}));

describe('Config Screen component', () => {
  beforeEach(() => {
    mockSdk.app.getParameters = vi.fn().mockResolvedValue({ roleTranslationMap: '{}' });
    mockSdk.app.setReady = vi.fn();
    mockSdk.app.onConfigure = vi.fn();
    mockSdk.app.getCurrentState = vi.fn().mockResolvedValue(null);
    mockSdk.notifier = { error: vi.fn() };
    mockSdk.cma.role.getMany = vi.fn().mockResolvedValue({
      items: [
        { sys: { id: 'role-us' }, name: 'Merchants (US)' },
        { sys: { id: 'role-editor' }, name: 'Editor' },
      ],
    });
  });

  afterEach(cleanup);

  it('renders one section per space role, seeding known roles with default guidance', async () => {
    const { findByText, findByDisplayValue } = render(<ConfigScreen />);

    expect(await findByText('Merchants (US)')).toBeTruthy();
    expect(await findByText('Editor')).toBeTruthy();
    // Merchants (US) should be pre-seeded with its default source/target/guidance
    expect(await findByDisplayValue(/avoid Spanglish|Spanglish/i)).toBeTruthy();
  });

  // A save that omits the Secret key deletes it, so the screen must refuse to save without one.
  const runLatestOnConfigure = () => {
    const calls = mockSdk.app.onConfigure.mock.calls;
    return calls[calls.length - 1][0]();
  };

  it('blocks the save and explains why when the key field is blank', async () => {
    const { findByText } = render(<ConfigScreen />);
    await findByText('Merchants (US)');

    expect(await runLatestOnConfigure()).toBe(false);
    expect(mockSdk.notifier.error).toHaveBeenCalled();
  });

  it('saves the trimmed key alongside the role map', async () => {
    const { findByText, getByPlaceholderText } = render(<ConfigScreen />);
    await findByText('Merchants (US)');

    fireEvent.change(getByPlaceholderText('sk-…'), { target: { value: '  sk-new-key  ' } });

    const { parameters } = await runLatestOnConfigure();
    expect(parameters.openaiApiKey).toBe('sk-new-key');
    expect(JSON.parse(parameters.roleTranslationMap)).toHaveProperty('Merchants (US)');
  });
});
