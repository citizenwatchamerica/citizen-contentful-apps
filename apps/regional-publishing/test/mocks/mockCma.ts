import { vi } from 'vitest';

const mockCma: any = {
  role: {
    getMany: vi.fn().mockResolvedValue({ items: [] }),
  },
  entry: {
    publish: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ sys: { fieldStatus: { '*': {} } } }),
  },
  scheduledActions: {
    getMany: vi.fn().mockResolvedValue({ items: [] }),
    create: vi.fn().mockResolvedValue({ sys: { id: 'scheduled-1' } }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
};

export { mockCma };
