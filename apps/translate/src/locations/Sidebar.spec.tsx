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
    mockSdk.cma.appActionCall.createWithResponse.mockReset();
    mockSdk.dialogs.openConfirm.mockReset().mockResolvedValue(true);
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
    mockSdk.cma.appActionCall.createWithResponse.mockResolvedValue({
      statusCode: 200,
      errors: [],
      response: { body: JSON.stringify({ translations: ['Hola'] }) },
    });

    const { getByText, getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Translate' }));

    await waitFor(() =>
      expect(
        getByText('Translated 1 field from English (United States) to Spanish (United States).')
      ).toBeTruthy()
    );
  });

  it('shows a rule picker when a role has more than one configured, and translates using the selected one', async () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [{ name: 'Merchants (CA)' }] };
    mockSdk.parameters.installation = {
      roleTranslationMap: JSON.stringify({
        'Merchants (CA)': [
          { source: 'en-CA', target: 'fr-CA', guidance: 'quebec french' },
          { source: 'en-US', target: 'en-CA', guidance: 'canadian english' },
        ],
      }),
    };
    mockSdk.entry.fields = {
      title: {
        id: 'title',
        name: 'Title',
        type: 'Symbol',
        locales: ['en-US', 'en-CA', 'fr-CA'],
        getValue: vi.fn(() => 'Hello'),
        setValue: vi.fn().mockResolvedValue(undefined),
      },
    };
    mockSdk.cma.appActionCall.createWithResponse.mockResolvedValue({
      statusCode: 200,
      errors: [],
      response: { body: JSON.stringify({ translations: ['Hello'] }) },
    });

    const { getByText, getByRole, container } = render(<Sidebar />);

    const select = container.querySelector('select')!;
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: '1' } });

    fireEvent.click(getByRole('button', { name: 'Translate' }));

    await waitFor(() =>
      expect(
        getByText('Translated 1 field from English (United States) to English (Canada).')
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
    mockSdk.cma.appActionCall.createWithResponse.mockResolvedValue({
      statusCode: 500,
      errors: [{ message: 'OpenAI key missing' }],
      response: { body: '' },
    });

    const { getByText, getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Translate' }));

    await waitFor(() => expect(getByText('Translation failed: OpenAI key missing')).toBeTruthy());
  });

  it('asks for confirmation naming the exact source and target locales before translating', async () => {
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
    mockSdk.cma.appActionCall.createWithResponse.mockResolvedValue({
      statusCode: 200,
      errors: [],
      response: { body: JSON.stringify({ translations: ['Hola'] }) },
    });

    const { getByRole } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Translate' }));

    await waitFor(() =>
      expect(mockSdk.dialogs.openConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'from English (United States) to Spanish (United States), overwriting any existing content'
          ),
        })
      )
    );
  });

  it('does not translate anything when the confirmation is cancelled', async () => {
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
    mockSdk.dialogs.openConfirm.mockResolvedValue(false);

    const { getByRole, queryByText } = render(<Sidebar />);
    fireEvent.click(getByRole('button', { name: 'Translate' }));

    await waitFor(() => expect(mockSdk.dialogs.openConfirm).toHaveBeenCalledTimes(1));
    expect(mockSdk.cma.appActionCall.createWithResponse).not.toHaveBeenCalled();
    expect(queryByText(/Translated/)).toBeNull();
  });
});
