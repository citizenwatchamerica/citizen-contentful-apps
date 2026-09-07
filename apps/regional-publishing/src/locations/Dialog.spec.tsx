import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSdk } from '../../test/mocks';
import Dialog from './Dialog';

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
}));

describe('Dialog component', () => {
  beforeEach(() => {
    mockSdk.close = vi.fn();
    mockSdk.parameters.invocation = {
      allowedLocales: ['en-US', 'en-GB'],
      excludedLocales: ['fr-FR'],
      localeStatus: { 'en-US': 'changed', 'en-GB': 'published', 'fr-FR': 'draft' },
      localeNames: {
        'en-US': 'English (United States)',
        'en-GB': 'English (United Kingdom)',
        'fr-FR': 'French (France)',
      },
    };
  });

  afterEach(cleanup);

  it('lists a checkbox and status badge per allowed locale (by display name), all checked by default, and lists the excluded ones', () => {
    const { getByText, container } = render(<Dialog />);

    expect(container.querySelector('#dialog-publish-en-US')).toHaveProperty('checked', true);
    expect(container.querySelector('#dialog-publish-en-GB')).toHaveProperty('checked', true);
    expect(getByText('English (United States)')).toBeTruthy();
    expect(getByText('English (United Kingdom)')).toBeTruthy();
    expect(getByText('changed')).toBeTruthy();
    expect(getByText('published')).toBeTruthy();
    expect(getByText('Not being published')).toBeTruthy();
    expect(getByText('French (France)')).toBeTruthy();
    expect(getByText('draft')).toBeTruthy();
    expect(getByText('Publish all my regions (2)')).toBeTruthy();
  });

  it('closes with only the checked locales once one is unchecked', () => {
    const { getByText, container } = render(<Dialog />);

    fireEvent.click(container.querySelector('#dialog-publish-en-GB')!);
    fireEvent.click(getByText('Publish selected regions (1)'));

    expect(mockSdk.close).toHaveBeenCalledWith(['en-US']);
  });

  it('closes with null on cancel', () => {
    const { getByText } = render(<Dialog />);

    fireEvent.click(getByText('Cancel'));

    expect(mockSdk.close).toHaveBeenCalledWith(null);
  });
});
