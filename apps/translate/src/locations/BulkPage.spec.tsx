import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockSdk } from '../../test/mocks';
import BulkPage from './BulkPage';

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
}));

const rules = JSON.stringify({
  'Merchants (CA)': [
    { source: 'en-US', target: 'en-CA', guidance: 'canadian english' },
    { source: 'en-CA', target: 'fr-CA', guidance: 'quebec french' },
  ],
  'Author (Global)': [{ source: 'en-US', target: 'es-US', guidance: '' }],
});

describe('Bulk translate page', () => {
  afterEach(cleanup);

  it('is limited to space admins', () => {
    mockSdk.user.spaceMembership = { admin: false, roles: [{ name: 'Merchants (CA)' }] };
    mockSdk.parameters.installation = { roleTranslationMap: rules };

    const { getByText, queryByText } = render(<BulkPage />);
    expect(getByText('Bulk translation is limited to space admins.')).toBeTruthy();
    expect(queryByText('Dry run')).toBeNull();
  });

  it('offers admins every configured direction from every role', () => {
    mockSdk.user.spaceMembership = { admin: true, roles: [] };
    mockSdk.parameters.installation = { roleTranslationMap: rules };

    const { container, getByText } = render(<BulkPage />);
    const options = [...container.querySelectorAll('option')].map(option => option.textContent);
    expect(options).toEqual([
      'English (United States) → English (Canada) (Merchants (CA))',
      'English (Canada) → French (Canada) (Merchants (CA))',
      'English (United States) → Spanish (United States) (Author (Global))',
    ]);
    expect(getByText('Dry run')).toBeTruthy();
  });
});
