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
    available: ['en-US', 'es-US', 'en-CA', 'fr-CA'],
    names: {
      'en-US': 'English (United States)',
      'es-US': 'Spanish (United States)',
      'en-CA': 'English (Canada)',
      'fr-CA': 'French (Canada)',
    },
  },
  user: {
    spaceMembership: {
      admin: false,
      roles: [],
    },
  },
  parameters: {
    installation: { roleTranslationMap: '{}' },
  },
  entry: {
    fields: {},
    save: vi.fn().mockResolvedValue(undefined),
  },
  dialogs: {
    openConfirm: vi.fn().mockResolvedValue(true),
  },
  window: {
    startAutoResizer: vi.fn(),
  },
};

export { mockSdk };
