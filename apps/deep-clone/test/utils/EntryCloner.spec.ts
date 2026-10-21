import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockCma } from '../mocks';
import EntryCloner, { ReferenceDiscoveryAbortedError } from '../../src/utils/EntryCloner';
import type { AppParameters } from '../../src/vite-env';
import { getMockContentType, getMockEntry } from './EntryClonerTestUtils';

vi.mock('@contentful/app-sdk', () => ({
  CMAClient: vi.fn().mockImplementation(() => mockCma),
}));

const setReferencesCount = vi.fn();
const setClonesCount = vi.fn();

describe('EntryCloner', () => {
  let entryCloner: EntryCloner;
  let mockParameters: AppParameters;
  let contentType: any;
  let referencedEntry: any;
  let mainEntry: any;
  let clonedReferencedEntry: any;
  let clonedMainEntry: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCma.contentType.get.mockReset();
    mockCma.entry.get.mockReset();
    mockCma.entry.createWithId.mockReset();

    mockParameters = {
      cloneText: '[CLONE]',
      cloneTextBefore: true,
      automaticRedirect: true,
    };
    entryCloner = new EntryCloner(
      mockCma as any,
      mockParameters,
      'main-entry-id',
      setReferencesCount,
      setClonesCount
    );
    // Clone ids are random in production; name each one after its original for readable assertions
    vi.spyOn(entryCloner as any, 'generateEntryId').mockImplementation(function (this: any) {
      const nextEntryId = Object.keys(this.references).find(
        (entryId) => this.cloneIds[entryId] === undefined
      );
      return `cloned-${nextEntryId}`;
    });
  });

  describe('Clone entry with reference field', () => {
    beforeEach(() => {
      contentType = getMockContentType([
        { id: 'title', type: 'Text' },
        { id: 'reference', type: 'Link', linkType: 'Entry' },
      ]);

      referencedEntry = getMockEntry('referenced-entry-id', {
        title: { 'en-US': 'Referenced Entry Title' },
      });

      mainEntry = getMockEntry('main-entry-id', {
        title: { 'en-US': 'Main Entry Title' },
        reference: {
          'en-US': {
            sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' },
          },
        },
      });

      clonedReferencedEntry = getMockEntry('cloned-referenced-entry-id', {
        title: { 'en-US': '[CLONE] Referenced Entry Title' },
      });

      clonedMainEntry = getMockEntry('cloned-main-entry-id', {
        title: { 'en-US': '[CLONE] Main Entry Title' },
        reference: {
          'en-US': {
            sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' },
          },
        },
      });
    });

    it('creates every clone already linking to the other clones', async () => {
      mockCma.contentType.get.mockResolvedValue(contentType);
      mockCma.entry.get.mockResolvedValueOnce(mainEntry).mockResolvedValueOnce(referencedEntry);
      mockCma.entry.createWithId
        .mockResolvedValueOnce(clonedMainEntry)
        .mockResolvedValueOnce(clonedReferencedEntry);
      const result = await entryCloner.cloneEntry();
      expect(result).toEqual(clonedMainEntry);
      expect(setReferencesCount).toHaveBeenCalledWith(2);
      expect(setClonesCount).toHaveBeenCalledWith(2);

      expect(mockCma.entry.get).toHaveBeenCalledTimes(2);
      expect(mockCma.entry.get).toHaveBeenCalledWith({ entryId: 'main-entry-id' });
      expect(mockCma.entry.get).toHaveBeenCalledWith({ entryId: 'referenced-entry-id' });
      expect(mockCma.entry.createWithId).toHaveBeenCalledTimes(2);
      expect(mockCma.entry.update).not.toHaveBeenCalled();

      expect(mockCma.entry.createWithId).toHaveBeenNthCalledWith(
        1,
        { contentTypeId: 'testContentType', entryId: 'cloned-main-entry-id' },
        {
          fields: {
            title: { 'en-US': '[CLONE] Main Entry Title' },
            reference: {
              'en-US': {
                sys: { type: 'Link', linkType: 'Entry', id: 'cloned-referenced-entry-id' },
              },
            },
          },
        }
      );
      expect(mockCma.entry.createWithId).toHaveBeenNthCalledWith(
        2,
        { contentTypeId: 'testContentType', entryId: 'cloned-referenced-entry-id' },
        {
          fields: {
            title: { 'en-US': '[CLONE] Referenced Entry Title' },
          },
        }
      );
    });

    it('generates distinct Contentful-style ids for the clones', async () => {
      vi.mocked((entryCloner as any).generateEntryId).mockRestore();
      mockCma.contentType.get.mockResolvedValue(contentType);
      mockCma.entry.get.mockResolvedValueOnce(mainEntry).mockResolvedValueOnce(referencedEntry);
      mockCma.entry.createWithId
        .mockResolvedValueOnce(clonedMainEntry)
        .mockResolvedValueOnce(clonedReferencedEntry);

      await entryCloner.cloneEntry();

      const mainCloneId = mockCma.entry.createWithId.mock.calls[0][0].entryId;
      const referencedCloneId = mockCma.entry.createWithId.mock.calls[1][0].entryId;
      expect(mainCloneId).toMatch(/^[A-Za-z0-9]{22}$/);
      expect(referencedCloneId).toMatch(/^[A-Za-z0-9]{22}$/);
      expect(mainCloneId).not.toEqual(referencedCloneId);
      expect(mockCma.entry.createWithId.mock.calls[0][1].fields.reference['en-US'].sys.id).toEqual(
        referencedCloneId
      );
    });
  });

  describe('Creation failure handling', () => {
    beforeEach(() => {
      contentType = getMockContentType([{ id: 'title', type: 'Text' }]);
      mainEntry = getMockEntry('main-entry-id', {
        title: { 'en-US': 'Main Entry Title' },
      });
    });

    it('throws with the CMA error reason when a clone cannot be created', async () => {
      mockCma.contentType.get.mockResolvedValue(contentType);
      mockCma.entry.get.mockResolvedValueOnce(mainEntry);
      const accessDeniedError = new Error(
        JSON.stringify({ status: 403, message: 'Forbidden field en-US' })
      );
      accessDeniedError.name = 'AccessDenied';
      mockCma.entry.createWithId.mockRejectedValueOnce(accessDeniedError);

      await expect(entryCloner.cloneEntry()).rejects.toThrow(
        'Failed to clone 1 entry: AccessDenied: Forbidden field en-US. The clone operation was aborted to prevent a partially-cloned structure.'
      );
    });
  });

  describe('Clone entry with array of references', () => {
    beforeEach(() => {
      contentType = getMockContentType([
        { id: 'title', type: 'Text' },
        { id: 'references', type: 'Array', items: { type: 'Link', linkType: 'Entry' } },
      ]);

      referencedEntry = getMockEntry('referenced-entry-id', {
        title: { 'en-US': 'Referenced Entry Title' },
      });

      mainEntry = getMockEntry('main-entry-id', {
        title: { 'en-US': 'Main Entry Title' },
        references: {
          'en-US': [
            { sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' } },
            { sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' } },
          ],
        },
      });

      clonedReferencedEntry = getMockEntry('cloned-referenced-entry-id', {
        title: { 'en-US': '[CLONE] Referenced Entry Title' },
      });

      clonedMainEntry = getMockEntry('cloned-main-entry-id', {
        title: { 'en-US': '[CLONE] Main Entry Title' },
        references: {
          'en-US': [
            { sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' } },
            { sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' } },
          ],
        },
      });
    });

    it('should clone an entry with array of references to the same entry and create only one clone', async () => {
      mockCma.contentType.get.mockResolvedValue(contentType);
      mockCma.entry.get.mockResolvedValueOnce(mainEntry).mockResolvedValueOnce(referencedEntry);
      mockCma.entry.createWithId
        .mockResolvedValueOnce(clonedMainEntry)
        .mockResolvedValueOnce(clonedReferencedEntry);

      const result = await entryCloner.cloneEntry();
      expect(result).toEqual(clonedMainEntry);
      expect(setReferencesCount).toHaveBeenCalledWith(2);
      expect(setClonesCount).toHaveBeenCalledWith(2);

      expect(mockCma.entry.get).toHaveBeenCalledWith({ entryId: 'main-entry-id' });
      expect(mockCma.entry.get).toHaveBeenCalledWith({ entryId: 'referenced-entry-id' });
      expect(mockCma.entry.createWithId).toHaveBeenCalledTimes(2);
      expect(mockCma.entry.createWithId).toHaveBeenNthCalledWith(
        1,
        { contentTypeId: 'testContentType', entryId: 'cloned-main-entry-id' },
        {
          fields: {
            title: { 'en-US': '[CLONE] Main Entry Title' },
            references: {
              'en-US': [
                { sys: { type: 'Link', linkType: 'Entry', id: 'cloned-referenced-entry-id' } },
                { sys: { type: 'Link', linkType: 'Entry', id: 'cloned-referenced-entry-id' } },
              ],
            },
          },
        }
      );
      expect(mockCma.entry.createWithId).toHaveBeenNthCalledWith(
        2,
        { contentTypeId: 'testContentType', entryId: 'cloned-referenced-entry-id' },
        {
          fields: {
            title: { 'en-US': '[CLONE] Referenced Entry Title' },
          },
        }
      );
    });
  });

  describe('Handle deleted entries', () => {
    beforeEach(() => {
      contentType = getMockContentType([
        { id: 'title', type: 'Text' },
        { id: 'reference', type: 'Link', linkType: 'Entry' },
      ]);

      mainEntry = getMockEntry('main-entry-id', {
        title: { 'en-US': 'Main Entry Title' },
        reference: {
          'en-US': {
            sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' },
          },
        },
      });

      clonedMainEntry = getMockEntry('cloned-main-entry-id', {
        title: { 'en-US': '[CLONE] Main Entry Title' },
        reference: {
          'en-US': {
            sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' },
          },
        },
      });
    });

    it('should not fail if an entry was deleted', async () => {
      mockCma.contentType.get.mockResolvedValue(contentType);
      mockCma.entry.get.mockResolvedValueOnce(mainEntry).mockRejectedValueOnce(new Error('Error'));
      mockCma.entry.createWithId.mockResolvedValueOnce(clonedMainEntry);
      const result = await entryCloner.cloneEntry();
      expect(result).toEqual(clonedMainEntry);
      expect(setReferencesCount).toHaveBeenCalledWith(1);
      expect(setClonesCount).toHaveBeenCalledWith(1);

      expect(mockCma.entry.get).toHaveBeenCalledTimes(2);
      expect(mockCma.entry.get).toHaveBeenCalledWith({ entryId: 'main-entry-id' });
      expect(mockCma.entry.get).toHaveBeenCalledWith({ entryId: 'referenced-entry-id' });
      expect(mockCma.entry.createWithId).toHaveBeenCalledTimes(1);

      expect(mockCma.entry.createWithId).toHaveBeenNthCalledWith(
        1,
        { contentTypeId: 'testContentType', entryId: 'cloned-main-entry-id' },
        {
          fields: {
            title: { 'en-US': '[CLONE] Main Entry Title' },
            reference: {
              'en-US': {
                sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' },
              },
            },
          },
        }
      );
    });
  });

  describe('Clone only selected references', () => {
    let anotherReferencedEntry: any;
    let clonedSelectedReferencedEntry: any;

    beforeEach(() => {
      contentType = getMockContentType([
        { id: 'title', type: 'Text' },
        { id: 'references', type: 'Array', items: { type: 'Link', linkType: 'Entry' } },
      ]);

      referencedEntry = getMockEntry('referenced-entry-id', {
        title: { 'en-US': 'Selected Referenced Entry' },
      });

      anotherReferencedEntry = getMockEntry('another-referenced-entry-id', {
        title: { 'en-US': 'Unselected Referenced Entry' },
      });

      mainEntry = getMockEntry('main-entry-id', {
        title: { 'en-US': 'Main Entry Title' },
        references: {
          'en-US': [
            { sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' } },
            { sys: { type: 'Link', linkType: 'Entry', id: 'another-referenced-entry-id' } },
          ],
        },
      });

      clonedSelectedReferencedEntry = getMockEntry('cloned-referenced-entry-id', {
        title: { 'en-US': '[CLONE] Selected Referenced Entry' },
      });

      clonedMainEntry = getMockEntry('cloned-main-entry-id', {
        title: { 'en-US': '[CLONE] Main Entry Title' },
        references: {
          'en-US': [
            { sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' } },
            { sys: { type: 'Link', linkType: 'Entry', id: 'another-referenced-entry-id' } },
          ],
        },
      });
    });

    it('should clone only the selected referenced entries and keep other links untouched', async () => {
      mockCma.contentType.get.mockResolvedValue(contentType);
      mockCma.entry.get
        .mockResolvedValueOnce(mainEntry)
        .mockResolvedValueOnce(referencedEntry)
        .mockResolvedValueOnce(anotherReferencedEntry);
      mockCma.entry.createWithId
        .mockResolvedValueOnce(clonedMainEntry)
        .mockResolvedValueOnce(clonedSelectedReferencedEntry);

      const result = await entryCloner.cloneEntry(['main-entry-id', 'referenced-entry-id']);

      expect(result).toEqual(clonedMainEntry);
      expect(setReferencesCount).toHaveBeenLastCalledWith(2);
      expect(setClonesCount).toHaveBeenCalledWith(2);

      expect(mockCma.entry.createWithId).toHaveBeenCalledTimes(2);
      expect(mockCma.entry.createWithId).toHaveBeenCalledWith(
        { contentTypeId: 'testContentType', entryId: 'cloned-main-entry-id' },
        {
          fields: {
            title: { 'en-US': '[CLONE] Main Entry Title' },
            references: {
              'en-US': [
                { sys: { type: 'Link', linkType: 'Entry', id: 'cloned-referenced-entry-id' } },
                { sys: { type: 'Link', linkType: 'Entry', id: 'another-referenced-entry-id' } },
              ],
            },
          },
        }
      );
    });
  });

  describe('Clone entry with Rich Text embedded references', () => {
    beforeEach(() => {
      contentType = getMockContentType([
        { id: 'title', type: 'Text' },
        { id: 'body', type: 'RichText' },
      ]);

      referencedEntry = getMockEntry('referenced-entry-id', {
        title: { 'en-US': 'Referenced Entry Title' },
        body: {
          'en-US': {
            nodeType: 'document',
            data: {},
            content: [
              {
                nodeType: 'paragraph',
                data: {},
                content: [
                  { nodeType: 'text', value: 'Nested reference content', marks: [], data: {} },
                ],
              },
            ],
          },
        },
      });

      mainEntry = getMockEntry('main-entry-id', {
        title: { 'en-US': 'Main Entry Title' },
        body: {
          'en-US': {
            nodeType: 'document',
            data: {},
            content: [
              {
                nodeType: 'embedded-entry-block',
                data: {
                  target: {
                    sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' },
                  },
                },
                content: [],
              },
              {
                nodeType: 'paragraph',
                data: {},
                content: [
                  { nodeType: 'text', value: 'Inline embed ', marks: [], data: {} },
                  {
                    nodeType: 'embedded-entry-inline',
                    data: {
                      target: {
                        sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' },
                      },
                    },
                    content: [],
                  },
                ],
              },
            ],
          },
        },
      });

      clonedReferencedEntry = getMockEntry('cloned-referenced-entry-id', {
        title: { 'en-US': '[CLONE] Referenced Entry Title' },
        body: {
          'en-US': {
            nodeType: 'document',
            data: {},
            content: [
              {
                nodeType: 'paragraph',
                data: {},
                content: [
                  { nodeType: 'text', value: 'Nested reference content', marks: [], data: {} },
                ],
              },
            ],
          },
        },
      });

      clonedMainEntry = getMockEntry('cloned-main-entry-id', {
        title: { 'en-US': '[CLONE] Main Entry Title' },
        body: {
          'en-US': {
            nodeType: 'document',
            data: {},
            content: [
              {
                nodeType: 'embedded-entry-block',
                data: {
                  target: {
                    sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' },
                  },
                },
                content: [],
              },
              {
                nodeType: 'paragraph',
                data: {},
                content: [
                  { nodeType: 'text', value: 'Inline embed ', marks: [], data: {} },
                  {
                    nodeType: 'embedded-entry-inline',
                    data: {
                      target: {
                        sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' },
                      },
                    },
                    content: [],
                  },
                ],
              },
            ],
          },
        },
      });
    });

    it('should clone and repoint embedded entry references inside Rich Text fields', async () => {
      mockCma.contentType.get.mockResolvedValue(contentType);
      mockCma.entry.get.mockResolvedValueOnce(mainEntry).mockResolvedValueOnce(referencedEntry);
      mockCma.entry.createWithId
        .mockResolvedValueOnce(clonedMainEntry)
        .mockResolvedValueOnce(clonedReferencedEntry);

      const result = await entryCloner.cloneEntry();

      expect(result).toEqual(clonedMainEntry);
      expect(setReferencesCount).toHaveBeenCalledWith(2);
      expect(setClonesCount).toHaveBeenCalledWith(2);

      expect(mockCma.entry.get).toHaveBeenCalledTimes(2);
      expect(mockCma.entry.get).toHaveBeenCalledWith({ entryId: 'main-entry-id' });
      expect(mockCma.entry.get).toHaveBeenCalledWith({ entryId: 'referenced-entry-id' });
      expect(mockCma.entry.createWithId).toHaveBeenCalledTimes(2);

      expect(mockCma.entry.createWithId).toHaveBeenCalledWith(
        { contentTypeId: 'testContentType', entryId: 'cloned-main-entry-id' },
        {
          fields: {
            title: { 'en-US': '[CLONE] Main Entry Title' },
            body: {
              'en-US': {
                nodeType: 'document',
                data: {},
                content: [
                  {
                    nodeType: 'embedded-entry-block',
                    data: {
                      target: {
                        sys: {
                          type: 'Link',
                          linkType: 'Entry',
                          id: 'cloned-referenced-entry-id',
                        },
                      },
                    },
                    content: [],
                  },
                  {
                    nodeType: 'paragraph',
                    data: {},
                    content: [
                      { nodeType: 'text', value: 'Inline embed ', marks: [], data: {} },
                      {
                        nodeType: 'embedded-entry-inline',
                        data: {
                          target: {
                            sys: {
                              type: 'Link',
                              linkType: 'Entry',
                              id: 'cloned-referenced-entry-id',
                            },
                          },
                        },
                        content: [],
                      },
                    ],
                  },
                ],
              },
            },
          },
        }
      );
    });
  });

  describe('getReferenceEntries', () => {
    beforeEach(() => {
      contentType = getMockContentType([{ id: 'title', type: 'Text' }]);
      referencedEntry = getMockEntry('referenced-entry-id', {
        title: { 'en-US': 'Referenced Entry Title' },
      });
      mainEntry = getMockEntry('main-entry-id', {
        title: { 'en-US': 'Main Entry Title' },
        reference: {
          'en-US': {
            sys: { type: 'Link', linkType: 'Entry', id: 'referenced-entry-id' },
          },
        },
      });
    });

    it('returns one row per unique referenced entry with labels', async () => {
      mockCma.contentType.get.mockResolvedValue(contentType);
      mockCma.entry.get.mockResolvedValueOnce(mainEntry).mockResolvedValueOnce(referencedEntry);

      const entries = await entryCloner.getReferenceEntries();

      expect(entries).toHaveLength(2);
      expect(entries[0].entryId).toBe('main-entry-id');
      expect(entries.map((entry) => entry.entryId).sort()).toEqual([
        'main-entry-id',
        'referenced-entry-id',
      ]);
    });

    it('lists the assets each entry links to, once each, including rich text embeds', async () => {
      const assetLink = (id: string) => ({ sys: { type: 'Link', linkType: 'Asset', id } });
      mainEntry = getMockEntry('main-entry-id', {
        title: { 'en-US': 'Main Entry Title' },
        image: { 'en-US': assetLink('hero'), 'fr-CA': assetLink('hero') },
        gallery: { 'en-US': [assetLink('photo-1'), assetLink('photo-2')] },
        body: {
          'en-US': {
            nodeType: 'document',
            content: [{ nodeType: 'embedded-asset-block', data: { target: assetLink('inline') } }],
          },
        },
      });
      mockCma.contentType.get.mockResolvedValue(contentType);
      mockCma.entry.get.mockResolvedValueOnce(mainEntry);

      const entries = await entryCloner.getReferenceEntries();

      expect(entries[0].assetIds).toEqual(['hero', 'photo-1', 'photo-2', 'inline']);
    });

    it('looks up linked media, marking missing or unprocessed assets as not copyable', async () => {
      const assetLink = (id: string) => ({ sys: { type: 'Link', linkType: 'Asset', id } });
      mainEntry = getMockEntry('main-entry-id', {
        title: { 'en-US': 'Main Entry Title' },
        gallery: {
          'en-US': [assetLink('photo'), assetLink('pdf'), assetLink('draft'), assetLink('gone')],
        },
      });
      mockCma.contentType.get.mockResolvedValue(contentType);
      mockCma.entry.get.mockResolvedValueOnce(mainEntry);
      const file = (fileName: string, contentType: string) => ({
        'en-US': { fileName, contentType, url: `//assets.ctfassets.net/${fileName}` },
      });
      mockCma.asset.getMany.mockResolvedValue({
        items: [
          {
            sys: { id: 'photo' },
            fields: { title: { 'en-US': 'Photo' }, file: file('photo.jpg', 'image/jpeg') },
          },
          { sys: { id: 'pdf' }, fields: { title: {}, file: file('guide.pdf', 'application/pdf') } },
          { sys: { id: 'draft' }, fields: { title: { 'en-US': 'Draft' } } },
        ],
      });

      await entryCloner.getReferenceEntries();
      const assets = await entryCloner.getReferenceAssets();

      expect(mockCma.asset.getMany).toHaveBeenCalledWith({
        query: { 'sys.id[in]': 'photo,pdf,draft,gone', limit: 100 },
      });
      expect(assets).toEqual({
        photo: {
          assetId: 'photo',
          title: 'Photo',
          fileName: 'photo.jpg',
          thumbnailUrl: 'https://assets.ctfassets.net/photo.jpg?w=96&h=96&fit=thumb',
          canCopy: true,
        },
        pdf: {
          assetId: 'pdf',
          title: 'guide.pdf',
          fileName: 'guide.pdf',
          thumbnailUrl: null,
          canCopy: true,
        },
        draft: {
          assetId: 'draft',
          title: 'Draft',
          fileName: null,
          thumbnailUrl: null,
          canCopy: false,
        },
        gone: {
          assetId: 'gone',
          title: 'gone',
          fileName: null,
          thumbnailUrl: null,
          canCopy: false,
        },
      });
    });

    it('returns entries in discovery order with depth and fan-in counts', async () => {
      const link = (id: string) => ({ sys: { type: 'Link', linkType: 'Entry', id } });
      const entries: Record<string, ReturnType<typeof getMockEntry>> = {
        root: getMockEntry('root', {
          title: { 'en-US': 'Zulu Root' },
          sections: { 'en-US': [link('section-b'), link('section-a')] },
        }),
        'section-b': getMockEntry('section-b', {
          title: { 'en-US': 'Bravo Section' },
          footer: { 'en-US': link('footer') },
        }),
        'section-a': getMockEntry('section-a', {
          title: { 'en-US': 'Alpha Section' },
          footer: { 'en-US': link('footer') },
        }),
        footer: getMockEntry('footer', { title: { 'en-US': 'Footer' } }),
      };
      entryCloner = new EntryCloner(
        mockCma as any,
        mockParameters,
        'root',
        setReferencesCount,
        setClonesCount
      );
      mockCma.contentType.get.mockResolvedValue(contentType);
      mockCma.entry.get.mockImplementation(async ({ entryId }) => entries[entryId]);

      const result = await entryCloner.getReferenceEntries();

      expect(
        result.map(({ entryId, depth, referencedByCount, parentEntryId, childEntryIds }) => ({
          entryId,
          depth,
          referencedByCount,
          parentEntryId,
          childEntryIds,
        }))
      ).toEqual([
        {
          entryId: 'root',
          depth: 0,
          referencedByCount: 0,
          parentEntryId: null,
          childEntryIds: ['section-b', 'section-a'],
        },
        {
          entryId: 'section-b',
          depth: 1,
          referencedByCount: 1,
          parentEntryId: 'root',
          childEntryIds: ['footer'],
        },
        {
          entryId: 'footer',
          depth: 2,
          referencedByCount: 2,
          parentEntryId: 'section-b',
          childEntryIds: [],
        },
        {
          entryId: 'section-a',
          depth: 1,
          referencedByCount: 1,
          parentEntryId: 'root',
          childEntryIds: ['footer'],
        },
      ]);
    });

    it('stops discovery when the abort signal is triggered', async () => {
      const abortController = new AbortController();
      mockCma.contentType.get.mockResolvedValue(contentType);
      mockCma.entry.get.mockImplementation(async ({ entryId }) => {
        if (entryId === 'main-entry-id') {
          abortController.abort();
          return mainEntry;
        }
        return referencedEntry;
      });

      await expect(
        entryCloner.getReferenceEntries({ signal: abortController.signal })
      ).rejects.toBeInstanceOf(ReferenceDiscoveryAbortedError);
    });
  });

  describe('Clone entry with asset links', () => {
    const assetLink = (id: string) => ({ sys: { type: 'Link', linkType: 'Asset', id } });

    const originalAsset = {
      sys: { id: 'original-asset-id' },
      fields: {
        title: { 'en-US': 'Hero image' },
        file: {
          'en-US': {
            url: '//images.ctfassets.net/space/original-asset-id/hash/hero.jpg',
            fileName: 'hero.jpg',
            contentType: 'image/jpeg',
          },
        },
      },
    };

    let assetEntry: any;

    beforeEach(() => {
      mockCma.asset.get.mockReset();
      mockCma.asset.create.mockReset();
      mockCma.asset.processForAllLocales.mockReset();
      mockCma.asset.delete.mockReset();

      mockCma.contentType.get.mockResolvedValue(
        getMockContentType([
          { id: 'title', type: 'Symbol' },
          { id: 'image', type: 'Link', linkType: 'Asset' },
          { id: 'focalPoint', type: 'Object' },
          { id: 'gallery', type: 'Array', items: { type: 'Link', linkType: 'Asset' } },
          { id: 'body', type: 'RichText' },
        ])
      );

      assetEntry = getMockEntry('main-entry-id', {
        title: { 'en-US': 'Image With Focal Point' },
        image: { 'en-US': assetLink('original-asset-id') },
        focalPoint: { 'en-US': { focalPoint: { x: 100, y: 200 } } },
        gallery: { 'en-US': [assetLink('original-asset-id')] },
        body: {
          'en-US': {
            nodeType: 'document',
            data: {},
            content: [
              { nodeType: 'paragraph', data: {}, content: [] },
              {
                nodeType: 'embedded-asset-block',
                data: { target: assetLink('original-asset-id') },
                content: [],
              },
            ],
          },
        },
      });

      mockCma.entry.get.mockResolvedValue(assetEntry);
      mockCma.entry.createWithId.mockImplementation(async (_params, props) =>
        getMockEntry('cloned-main-entry-id', props.fields)
      );
    });

    it('removes asset links and the focal point when the asset cannot be fetched', async () => {
      mockCma.asset.get.mockRejectedValue(new Error('NotFound'));

      await entryCloner.cloneEntry();

      expect(mockCma.asset.create).not.toHaveBeenCalled();
      expect(mockCma.entry.createWithId).toHaveBeenCalledWith(
        { contentTypeId: 'testContentType', entryId: 'cloned-main-entry-id' },
        {
          fields: {
            title: { 'en-US': '[CLONE] Image With Focal Point' },
            gallery: { 'en-US': [] },
            body: {
              'en-US': {
                nodeType: 'document',
                data: {},
                content: [{ nodeType: 'paragraph', data: {}, content: [] }],
              },
            },
          },
        }
      );
    });

    it('reports how many asset links were removed', async () => {
      mockCma.asset.get.mockRejectedValue(new Error('NotFound'));

      await entryCloner.cloneEntry();

      expect(entryCloner.getRemovedAssetLinkCount()).toBe(3);
      expect(await entryCloner.getClonedAssetCount()).toBe(0);
    });

    it('does not modify the original entry fields', async () => {
      mockCma.asset.get.mockRejectedValue(new Error('NotFound'));

      await entryCloner.cloneEntry();

      expect(assetEntry.fields.image['en-US']).toEqual(assetLink('original-asset-id'));
      expect(assetEntry.fields.focalPoint['en-US']).toEqual({ focalPoint: { x: 100, y: 200 } });
    });

    it('clones the asset once and repoints every link to the copy', async () => {
      mockCma.asset.get.mockResolvedValue(originalAsset);
      mockCma.asset.create.mockResolvedValue({ sys: { id: 'cloned-asset-id' } });
      mockCma.asset.processForAllLocales.mockResolvedValue({ sys: { id: 'cloned-asset-id' } });

      await entryCloner.cloneEntry();

      expect(mockCma.asset.create).toHaveBeenCalledTimes(1);
      expect(mockCma.asset.create).toHaveBeenCalledWith(
        {},
        {
          fields: {
            title: { 'en-US': '[CLONE] Hero image' },
            file: {
              'en-US': {
                contentType: 'image/jpeg',
                fileName: 'hero.jpg',
                upload: 'https://images.ctfassets.net/space/original-asset-id/hash/hero.jpg',
              },
            },
          },
        }
      );

      const createdFields = mockCma.entry.createWithId.mock.calls[0][1].fields;
      expect(createdFields.image['en-US']).toEqual(assetLink('cloned-asset-id'));
      expect(createdFields.gallery['en-US']).toEqual([assetLink('cloned-asset-id')]);
      expect(createdFields.body['en-US'].content[1].data.target).toEqual(
        assetLink('cloned-asset-id')
      );
      expect(createdFields.focalPoint['en-US']).toEqual({ focalPoint: { x: 100, y: 200 } });
      expect(entryCloner.getRemovedAssetLinkCount()).toBe(0);
      expect(await entryCloner.getClonedAssetCount()).toBe(1);
    });

    it('removes asset links and deletes the partial asset when processing fails', async () => {
      mockCma.asset.get.mockResolvedValue(originalAsset);
      mockCma.asset.create.mockResolvedValue({ sys: { id: 'cloned-asset-id' } });
      mockCma.asset.processForAllLocales.mockRejectedValue(new Error('Processing timed out'));
      mockCma.asset.delete.mockResolvedValue(undefined);

      await entryCloner.cloneEntry();

      expect(mockCma.asset.delete).toHaveBeenCalledWith({ assetId: 'cloned-asset-id' });
      const createdFields = mockCma.entry.createWithId.mock.calls[0][1].fields;
      expect(createdFields.image).toBeUndefined();
      expect(createdFields.focalPoint).toBeUndefined();
      expect(entryCloner.getRemovedAssetLinkCount()).toBe(3);
    });

    it('removes asset links when the asset has no file', async () => {
      mockCma.asset.get.mockResolvedValue({ sys: { id: 'original-asset-id' }, fields: {} });

      await entryCloner.cloneEntry();

      expect(mockCma.asset.create).not.toHaveBeenCalled();
      expect(mockCma.entry.createWithId.mock.calls[0][1].fields.image).toBeUndefined();
    });
  });
});
