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
    names: { 'en-US': 'English (United States)', 'en-GB': 'English (United Kingdom)' },
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
  dialogs: {
    openCurrentApp: vi.fn(),
  },
  window: {
    startAutoResizer: vi.fn(),
  },
};

export { mockSdk };
