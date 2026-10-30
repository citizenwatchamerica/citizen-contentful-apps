import { vi } from 'vitest';

const mockCma: any = {
  role: {
    getMany: vi.fn().mockResolvedValue({ items: [] }),
  },
  entry: {
    publish: vi.fn().mockResolvedValue(undefined),
    unpublish: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ sys: { fieldStatus: { '*': {} } } }),
    getPublished: vi.fn().mockResolvedValue({ items: [] }),
    getMany: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  },
  asset: {
    publish: vi.fn().mockResolvedValue(undefined),
    getMany: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  },
  contentType: {
    get: vi.fn().mockResolvedValue({ fields: [], displayField: 'title' }),
  },
  scheduledActions: {
    getMany: vi.fn().mockResolvedValue({ items: [] }),
    create: vi.fn().mockResolvedValue({ sys: { id: 'scheduled-1' } }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
};

export { mockCma };
