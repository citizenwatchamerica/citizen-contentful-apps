import { vi } from 'vitest';
import { mockCma } from './mockCma';

const mockSdk: any = {
  cma: mockCma,
  app: {
    onConfigure: vi.fn(),
    getParameters: vi.fn().mockReturnValueOnce({}),
    setReady: vi.fn(),
    getCurrentState: vi.fn(),
  },
  ids: {
    app: 'test-app',
    entry: 'test-entry',
  },
  locales: {
    available: ['en-US', 'en-GB'],
  },
  user: {
    spaceMembership: {
      admin: false,
      roles: [],
    },
  },
  parameters: {
    installation: { roleLocaleMap: {} },
  },
  entry: {
    getSys: vi.fn().mockReturnValue({ version: 1 }),
  },
  window: {
    startAutoResizer: vi.fn(),
  },
};

export { mockSdk };
