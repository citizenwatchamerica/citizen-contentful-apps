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
    environment: 'master',
  },
  locales: {
    default: 'en-US',
    available: ['en-US', 'en-GB'],
    names: { 'en-US': 'English (United States)', 'en-GB': 'English (United Kingdom)' },
  },
  user: {
    sys: { id: 'current-user', type: 'User' },
    spaceMembership: {
      admin: false,
      roles: [],
    },
  },
  parameters: {
    installation: { roleLocaleMap: {} },
  },
  contentType: {
    fields: [{ id: 'title', localized: true }],
  },
  entry: {
    getSys: vi.fn().mockReturnValue({ version: 1 }),
    onSysChanged: vi.fn().mockReturnValue(() => {}),
  },
  dialogs: {
    openCurrentApp: vi.fn(),
  },
  window: {
    startAutoResizer: vi.fn(),
  },
};

export { mockSdk };
