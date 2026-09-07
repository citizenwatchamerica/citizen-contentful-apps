import { vi } from 'vitest';

const mockCma: any = {
  role: {
    getMany: vi.fn().mockResolvedValue({ items: [] }),
  },
  appActionCall: {
    createWithResult: vi.fn(),
  },
};

export { mockCma };
