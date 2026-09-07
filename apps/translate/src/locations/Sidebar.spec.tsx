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
    mockSdk.entry.fields = {};
    mockSdk.cma.appActionCall.createWithResult.mockReset();
  });

  afterEach(cleanup);

  it('shows a warning when the role has no translation configured', () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [] };
    mockSdk.parameters.installation = { roleTranslationMap: '{}' };

    const { getByText, getByRole } = render(<Sidebar />);
    expect(getByText(/isn't configured for translation/)).toBeTruthy();
  });

  it('translates fields and reports how many were updated', async () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [{ name: 'Merchants (US)' }] };
    mockSdk.parameters.installation = {
      roleTranslationMap: JSON.stringify({
        'Merchants (US)': { source: 'en-US', target: 'es-US', guidance: '' },
      }),
    };
    mockSdk.entry.fields = {
      title: {
        id: 'title',
        name: 'Title',
        type: 'Symbol',
        locales: ['en-US', 'es-US'],
        getValue: vi.fn(() => 'Hello'),
        setValue: vi.fn().mockResolvedValue(undefined),
      },
    };
    mockSdk.cma.appActionCall.createWithResult.mockResolvedValue({
      sys: { status: 'succeeded', result: { translations: ['Hola'] } },
    });

    const { getByText, getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Translate' }));

    await waitFor(() =>
      expect(
        getByText('Translated 1 field from English (United States) to Spanish (United States).')
      ).toBeTruthy()
    );
  });

  it('shows the real error message when translation fails', async () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [{ name: 'Merchants (US)' }] };
    mockSdk.parameters.installation = {
      roleTranslationMap: JSON.stringify({
        'Merchants (US)': { source: 'en-US', target: 'es-US', guidance: '' },
      }),
    };
    mockSdk.entry.fields = {
      title: {
        id: 'title',
        name: 'Title',
        type: 'Symbol',
        locales: ['en-US', 'es-US'],
        getValue: vi.fn(() => 'Hello'),
        setValue: vi.fn().mockResolvedValue(undefined),
      },
    };
    mockSdk.cma.appActionCall.createWithResult.mockResolvedValue({
      sys: { status: 'failed', error: { message: 'OpenAI key missing' } },
    });

    const { getByText, getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Translate' }));

    await waitFor(() => expect(getByText('Translation failed: OpenAI key missing')).toBeTruthy());
  });
});
