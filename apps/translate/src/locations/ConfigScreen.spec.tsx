import { cleanup, render } from '@testing-library/react';
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
});
