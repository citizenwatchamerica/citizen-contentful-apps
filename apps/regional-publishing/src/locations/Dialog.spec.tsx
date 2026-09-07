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
    };
  });

  afterEach(cleanup);

  it('lists a checkbox per allowed locale, all checked by default, and shows the excluded ones', () => {
    const { getByText, container } = render(<Dialog />);

    expect(container.querySelector('#dialog-publish-en-US')).toHaveProperty('checked', true);
    expect(container.querySelector('#dialog-publish-en-GB')).toHaveProperty('checked', true);
    expect(getByText('Not affected by this publish: fr-FR')).toBeTruthy();
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
