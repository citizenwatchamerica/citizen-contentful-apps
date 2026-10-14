import React from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import ReferenceSelectionDialog from '../../src/locations/ReferenceSelectionDialog';
import type { CloneReferenceAsset, CloneReferenceEntry } from '../../src/utils/EntryCloner';

let invocationParameters: {
  rootEntryId: string;
  referenceEntries: CloneReferenceEntry[];
  referenceAssets?: Record<string, CloneReferenceAsset>;
};

const mockSdk = {
  parameters: {
    get invocation() {
      return invocationParameters;
    },
  },
  close: vi.fn(),
};

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
  useAutoResizer: () => {},
}));

// root → branch0 → shared, root → branch1 → shared, branch1 → only1
// root and branch1 share the hero asset; only1 links two assets of its own
const referenceEntries: CloneReferenceEntry[] = [
  {
    entryId: 'root',
    label: 'Root',
    contentTypeId: 'page',
    depth: 0,
    referencedByCount: 0,
    parentEntryId: null,
    childEntryIds: ['branch0', 'branch1'],
    assetIds: ['hero'],
  },
  {
    entryId: 'branch0',
    label: 'Branch 0',
    contentTypeId: 'section',
    depth: 1,
    referencedByCount: 1,
    parentEntryId: 'root',
    childEntryIds: ['shared'],
    assetIds: [],
  },
  {
    entryId: 'shared',
    label: 'Shared Leaf',
    contentTypeId: 'block',
    depth: 2,
    referencedByCount: 2,
    parentEntryId: 'branch0',
    childEntryIds: [],
    assetIds: [],
  },
  {
    entryId: 'branch1',
    label: 'Branch 1',
    contentTypeId: 'section',
    depth: 1,
    referencedByCount: 1,
    parentEntryId: 'root',
    childEntryIds: ['shared', 'only1'],
    assetIds: ['hero'],
  },
  {
    entryId: 'only1',
    label: 'Only Under Branch 1',
    contentTypeId: 'block',
    depth: 2,
    referencedByCount: 1,
    parentEntryId: 'branch1',
    childEntryIds: [],
    assetIds: ['only1-image', 'only1-file'],
  },
];

const referenceAssets: Record<string, CloneReferenceAsset> = {
  hero: {
    assetId: 'hero',
    title: 'Hero Image',
    fileName: 'hero.jpg',
    thumbnailUrl: 'https://images.ctfassets.net/hero.jpg?w=96&h=96&fit=thumb',
    canCopy: true,
  },
  'only1-image': {
    assetId: 'only1-image',
    title: 'Only1 Image',
    fileName: 'only1.png',
    thumbnailUrl: null,
    canCopy: true,
  },
  'only1-file': {
    assetId: 'only1-file',
    title: 'only1-file',
    fileName: null,
    thumbnailUrl: null,
    canCopy: false,
  },
};

describe('ReferenceSelectionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invocationParameters = { rootEntryId: 'root', referenceEntries, referenceAssets };
  });

  it('counts each unique referenced entry once', () => {
    render(<ReferenceSelectionDialog />);

    expect(screen.getByText(/^Selected 4 of 4 referenced entries/)).toBeDefined();
  });

  it('deselecting a referenced entry updates the selection count', () => {
    render(<ReferenceSelectionDialog />);

    const sharedCheckbox = screen.getByText('Shared Leaf').closest('label')?.querySelector('input');
    expect(sharedCheckbox).toBeTruthy();
    act(() => {
      sharedCheckbox!.click();
    });

    expect(screen.getByText(/^Selected 3 of 4 referenced entries/)).toBeDefined();
  });

  it('says linked media is copied and counts each copyable asset once', () => {
    render(<ReferenceSelectionDialog />);

    expect(
      screen.getByText(/Images and files linked from the entries you clone are copied too/)
    ).toBeDefined();
    expect(
      screen.getByText('Selected 4 of 4 referenced entries · 2 media files to copy')
    ).toBeDefined();
  });

  it('stops counting the media of entries that will not be cloned', () => {
    render(<ReferenceSelectionDialog />);

    const branch1Checkbox = screen.getByText('Branch 1').closest('label')?.querySelector('input');
    act(() => {
      branch1Checkbox!.click();
    });

    // only1 is reachable only through branch1, so it is deselected too; root still copies the hero
    expect(
      screen.getByText('Selected 2 of 4 referenced entries · 1 media file to copy')
    ).toBeDefined();
  });

  it('lists the media linked from each entry under it', () => {
    render(<ReferenceSelectionDialog />);

    const rootMedia = screen.getByTestId('media-list-root');
    expect(within(rootMedia).getByText('Hero Image')).toBeDefined();
    expect(within(rootMedia).getByText('Copied as a new asset · hero.jpg')).toBeDefined();
    expect(within(screen.getByTestId('media-list-only1')).getByText('Only1 Image')).toBeDefined();
    expect(screen.queryByTestId('media-list-branch0')).toBeNull();
  });

  it('warns about media that cannot be copied', () => {
    render(<ReferenceSelectionDialog />);

    expect(
      within(screen.getByTestId('media-list-only1')).getByText(
        "Can't be copied, so it will be removed from the clone"
      )
    ).toBeDefined();
  });

  it('marks the media of deselected entries as not copied', () => {
    render(<ReferenceSelectionDialog />);

    const branch1Checkbox = screen.getByText('Branch 1').closest('label')?.querySelector('input');
    act(() => {
      branch1Checkbox!.click();
    });

    expect(
      within(screen.getByTestId('media-list-branch1')).getByText(
        'Not copied: this entry stays linked to the original'
      )
    ).toBeDefined();
  });

  it('falls back to asset ids when the media lookup failed', () => {
    invocationParameters = { rootEntryId: 'root', referenceEntries };
    render(<ReferenceSelectionDialog />);

    expect(within(screen.getByTestId('media-list-root')).getByText('hero')).toBeDefined();
    expect(
      screen.getByText('Selected 4 of 4 referenced entries · 3 media files to copy')
    ).toBeDefined();
  });

  it('confirms with the selected entry ids', () => {
    render(<ReferenceSelectionDialog />);

    act(() => {
      screen.getByText('Clone selected entries').click();
    });

    expect(mockSdk.close).toHaveBeenCalledTimes(1);
    const closedWith = mockSdk.close.mock.calls[0][0] as string[];
    expect(closedWith.sort()).toEqual(['branch0', 'branch1', 'only1', 'root', 'shared']);
  });

  it('renders entries in the provided structural order', () => {
    render(<ReferenceSelectionDialog />);

    const labels = screen
      .getAllByText(/^(Root|Branch 0|Branch 1|Shared Leaf|Only Under Branch 1)$/)
      .map((element) => element.textContent);
    expect(labels).toEqual(['Root', 'Branch 0', 'Shared Leaf', 'Branch 1', 'Only Under Branch 1']);
  });

  it('indents entries by depth', () => {
    render(<ReferenceSelectionDialog />);

    const rowFor = (entryId: string) => screen.getByTestId(`reference-row-${entryId}`);
    expect(rowFor('root').style.marginLeft).toBe('0px');
    expect(rowFor('branch0').style.marginLeft).toBe('20px');
    expect(rowFor('shared').style.marginLeft).toBe('40px');
  });

  it('hints when an entry is referenced by multiple parents', () => {
    render(<ReferenceSelectionDialog />);

    expect(screen.getByText('block · shared · also referenced by 1 other entry')).toBeDefined();
    expect(screen.getByText('section · branch0')).toBeDefined();
  });

  describe('cascading selection', () => {
    const checkboxFor = (entryId: string) =>
      screen.getByTestId(`reference-row-${entryId}`).querySelector('input') as HTMLInputElement;
    const toggle = (entryId: string) => act(() => checkboxFor(entryId).click());

    it('deselects entries only reachable through a deselected entry', () => {
      render(<ReferenceSelectionDialog />);

      toggle('branch1');

      expect(checkboxFor('branch1').checked).toBe(false);
      expect(checkboxFor('only1').checked).toBe(false);
      expect(screen.getByText(/^Selected 2 of 4 referenced entries/)).toBeDefined();
    });

    it('keeps shared entries selected while another selected parent references them', () => {
      render(<ReferenceSelectionDialog />);

      toggle('branch1');

      expect(checkboxFor('shared').checked).toBe(true);
    });

    it('deselects a shared entry once every parent referencing it is deselected', () => {
      render(<ReferenceSelectionDialog />);

      toggle('branch0');
      expect(checkboxFor('shared').checked).toBe(true);

      toggle('branch1');
      expect(checkboxFor('shared').checked).toBe(false);
      expect(screen.getByText(/^Selected 0 of 4 referenced entries/)).toBeDefined();
    });

    it('reselecting an entry restores the entries nested under it', () => {
      render(<ReferenceSelectionDialog />);

      toggle('branch1');
      toggle('branch1');

      expect(checkboxFor('only1').checked).toBe(true);
      expect(screen.getByText(/^Selected 4 of 4 referenced entries/)).toBeDefined();
    });

    it('selecting a nested entry reselects its parent chain', () => {
      render(<ReferenceSelectionDialog />);

      toggle('branch1');
      toggle('only1');

      expect(checkboxFor('branch1').checked).toBe(true);
      expect(checkboxFor('only1').checked).toBe(true);
    });

    it('handles reference cycles without looping', () => {
      invocationParameters = {
        rootEntryId: 'root',
        referenceEntries: [
          { ...referenceEntries[0]!, childEntryIds: ['loop'] },
          {
            entryId: 'loop',
            label: 'Loop',
            contentTypeId: 'section',
            depth: 1,
            referencedByCount: 1,
            parentEntryId: 'root',
            childEntryIds: ['root'],
            assetIds: [],
          },
        ],
      };
      render(<ReferenceSelectionDialog />);

      toggle('loop');
      expect(checkboxFor('loop').checked).toBe(false);
      toggle('loop');
      expect(checkboxFor('loop').checked).toBe(true);
    });
  });

  it('names the parent on rows nested past the indent cap', () => {
    const chain: CloneReferenceEntry[] = Array.from({ length: 11 }, (_, depth) => ({
      entryId: `level${depth}`,
      label: `Level ${depth}`,
      contentTypeId: 'section',
      depth,
      referencedByCount: depth === 0 ? 0 : 1,
      parentEntryId: depth === 0 ? null : `level${depth - 1}`,
      childEntryIds: depth === 10 ? [] : [`level${depth + 1}`],
      assetIds: [],
    }));
    invocationParameters = { rootEntryId: 'level0', referenceEntries: chain };
    render(<ReferenceSelectionDialog />);

    expect(screen.getByText('section · level8')).toBeDefined();
    expect(screen.getByText('section · level9 · under Level 8')).toBeDefined();
    expect(screen.getByText('section · level10 · under Level 9')).toBeDefined();
    expect(screen.getByTestId('reference-row-level10').style.marginLeft).toBe('160px');
  });
});
