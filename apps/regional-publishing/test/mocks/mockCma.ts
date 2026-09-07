import { vi } from 'vitest';

const mockCma: any = {
  role: {
    getMany: vi.fn().mockResolvedValue({ items: [] }),
  },
  entry: {
    publish: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ sys: { fieldStatus: { '*': {} } } }),
  },
};

export { mockCma };
