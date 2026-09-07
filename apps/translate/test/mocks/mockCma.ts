import { vi } from 'vitest';

const mockCma: any = {
  role: {
    getMany: vi.fn().mockResolvedValue({ items: [] }),
  },
  appActionCall: {
    createWithResponse: vi.fn(),
  },
};

export { mockCma };
