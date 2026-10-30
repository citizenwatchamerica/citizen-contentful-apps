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

    expect(mockSdk.close).toHaveBeenCalledWith({ locales: ['en-US'], linkedIds: [] });
  });

  it('locks required locales on and explains why', () => {
    mockSdk.parameters.invocation = { ...mockSdk.parameters.invocation, requiredLocales: ['en-US'] };
    const { getByText, container } = render(<Dialog />);

    const requiredCheckbox = container.querySelector('#dialog-publish-en-US');
    expect(requiredCheckbox).toHaveProperty('checked', true);
    expect(requiredCheckbox).toHaveProperty('disabled', true);
    expect(container.querySelector('#dialog-publish-en-GB')).toHaveProperty('disabled', false);
    expect(getByText(/has to be\s+included, either because this entry has never been published/)).toBeTruthy();
  });

  it('offers optional locales unticked and lets the user add them', () => {
    mockSdk.parameters.invocation = { ...mockSdk.parameters.invocation, optionalLocales: ['en-US'] };
    const { getByText, container } = render(<Dialog />);

    expect(container.querySelector('#dialog-publish-en-US')).toHaveProperty('checked', false);
    expect(container.querySelector('#dialog-publish-en-US')).toHaveProperty('disabled', false);
    expect(container.querySelector('#dialog-publish-en-GB')).toHaveProperty('checked', true);
    expect(getByText(/Your team owns this entry, so you can also publish/)).toBeTruthy();

    fireEvent.click(getByText('Publish selected regions (1)'));
    expect(mockSdk.close).toHaveBeenLastCalledWith({ locales: ['en-GB'], linkedIds: [] });

    fireEvent.click(container.querySelector('#dialog-publish-en-US')!);
    fireEvent.click(getByText('Publish all my regions (2)'));
    expect(mockSdk.close).toHaveBeenLastCalledWith({ locales: ['en-GB', 'en-US'], linkedIds: [] });
  });

  it('in unpublish mode, starts with nothing checked and uses unpublish wording', () => {
    mockSdk.parameters.invocation = { ...mockSdk.parameters.invocation, mode: 'unpublish' };
    const { getByText, container } = render(<Dialog />);

    expect(container.querySelector('#dialog-unpublish-en-US')).toHaveProperty('checked', false);
    expect(container.querySelector('#dialog-unpublish-en-GB')).toHaveProperty('checked', false);
    expect(getByText('Not affected')).toBeTruthy();
    expect(getByText('Unpublish selected regions (0)').closest('button')).toHaveProperty('disabled', true);

    fireEvent.click(container.querySelector('#dialog-unpublish-en-GB')!);
    fireEvent.click(getByText('Unpublish selected regions (1)'));

    expect(mockSdk.close).toHaveBeenCalledWith(['en-GB']);
  });

  it('blocks unpublishing the default locale unless every live locale is selected too', () => {
    mockSdk.parameters.invocation = {
      ...mockSdk.parameters.invocation,
      mode: 'unpublish',
      defaultLocale: 'en-US',
      liveLocales: ['en-US', 'en-GB'],
    };
    const { getByText, queryByText, container } = render(<Dialog />);

    fireEvent.click(container.querySelector('#dialog-unpublish-en-US')!);
    expect(getByText(/is the default locale/)).toBeTruthy();
    expect(getByText('Unpublish selected regions (1)').closest('button')).toHaveProperty('disabled', true);

    fireEvent.click(container.querySelector('#dialog-unpublish-en-GB')!);
    expect(queryByText(/is the default locale/)).toBeNull();
    expect(getByText('Unpublish all my regions (2)').closest('button')).toHaveProperty('disabled', false);
  });

  it('lists linked content by reference field, ticked, and lets the user untick some', () => {
    mockSdk.parameters.invocation = {
      ...mockSdk.parameters.invocation,
      fieldNames: { slides: 'Slides', hero: 'Hero' },
      linkedItems: [
        { id: 'slide-1', type: 'Entry', title: 'Spring slide', status: 'draft', locales: ['en-GB'], fieldIds: ['slides'], sharedFieldChanges: [] },
        { id: 'photo-1', type: 'Asset', title: 'Spring photo', status: 'draft', locales: ['en-GB'], fieldIds: ['slides'], sharedFieldChanges: [] },
        { id: 'hero-1', type: 'Entry', title: 'Hero banner', status: 'changed', locales: ['en-US'], fieldIds: ['hero'], sharedFieldChanges: [] },
      ],
    };
    const { getByText, container } = render(<Dialog />);

    expect(getByText('Also publish linked content (3 of 3)')).toBeTruthy();
    expect(getByText('Slides')).toBeTruthy();
    expect(getByText('Hero')).toBeTruthy();
    expect(getByText(/Spring photo/).textContent).toContain('(media)');
    expect(container.querySelector('#dialog-linked-slide-1')).toHaveProperty('checked', true);

    fireEvent.click(container.querySelector('#dialog-linked-photo-1')!);
    fireEvent.click(getByText('Publish all my regions (2)'));
    expect(mockSdk.close).toHaveBeenLastCalledWith({ locales: ['en-US', 'en-GB'], linkedIds: ['slide-1', 'hero-1'] });
  });

  it('hides linked content that only shows in unticked regions', () => {
    mockSdk.parameters.invocation = {
      ...mockSdk.parameters.invocation,
      linkedItems: [
        { id: 'slide-1', type: 'Entry', title: 'Spring slide', status: 'draft', locales: ['en-GB'], fieldIds: ['slides'], sharedFieldChanges: [] },
      ],
    };
    const { getByText, queryByText, container } = render(<Dialog />);

    fireEvent.click(container.querySelector('#dialog-publish-en-GB')!);
    expect(queryByText('Spring slide')).toBeNull();
    fireEvent.click(getByText('Publish selected regions (1)'));
    expect(mockSdk.close).toHaveBeenLastCalledWith({ locales: ['en-US'], linkedIds: [] });
  });

  it("names a linked item's changed shared fields", () => {
    mockSdk.parameters.invocation = {
      ...mockSdk.parameters.invocation,
      defaultLocale: 'en-US',
      linkedItems: [
        { id: 'focal', type: 'Entry', title: 'Banner image', status: 'changed', locales: ['en-GB'], fieldIds: ['slides'], sharedFieldChanges: ['Focal point'] },
      ],
    };
    const { getByText } = render(<Dialog />);
    expect(getByText(/Shared fields changed: Focal point\. These go live with\s+English \(United States\)/)).toBeTruthy();
  });

  it("ticks the optional default locale when the entry's own shared fields changed, and says why", () => {
    mockSdk.parameters.invocation = {
      ...mockSdk.parameters.invocation,
      optionalLocales: ['en-US'],
      defaultLocale: 'en-US',
      sharedFieldChanges: ['Slug'],
    };
    const { getByText, container } = render(<Dialog />);

    expect(container.querySelector('#dialog-publish-en-US')).toHaveProperty('checked', true);
    expect(getByText(/Slug has unpublished\s+changes/).textContent).toContain('which is ticked');
  });

  it("warns when the entry's shared-field changes need a default locale the user can't publish", () => {
    mockSdk.parameters.invocation = {
      ...mockSdk.parameters.invocation,
      allowedLocales: ['en-GB'],
      defaultLocale: 'en-US',
      sharedFieldChanges: ['Slug', 'Size'],
    };
    const { getByText } = render(<Dialog />);
    expect(getByText(/Slug, Size have unpublished/).textContent).toContain('only the owning team or an admin can publish them');
  });

  it('warns when the linked content list may be incomplete', () => {
    mockSdk.parameters.invocation = { ...mockSdk.parameters.invocation, linkedIncomplete: true };
    const { getByText } = render(<Dialog />);
    expect(getByText(/Not everything this entry links to could be checked/)).toBeTruthy();
  });

  it('closes with null on cancel', () => {
    const { getByText } = render(<Dialog />);

    fireEvent.click(getByText('Cancel'));

    expect(mockSdk.close).toHaveBeenCalledWith(null);
  });
});
