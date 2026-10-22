import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const searchProducts = vi.fn();
const notifierError = vi.fn();

vi.mock('../../utils/Sfcc', () => ({
  default: vi.fn().mockImplementation(() => ({ searchProducts, searchCategories: vi.fn() })),
}));

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => sdk,
}));

const sdk = {
  parameters: {
    installation: {},
    invocation: {
      selectMultiple: true,
      fieldType: 'product',
      fieldValue: [],
      currentData: [],
      siteIds: ['siteA'],
      siteMap: {},
    },
  },
  notifier: { error: notifierError },
  close: vi.fn(),
};

import SearchPicker from './SearchPicker';

const hit = (id: string) => ({ id, name: { default: id } });

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('SearchPicker search requests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchProducts.mockReset();
    notifierError.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores an earlier response that resolves after a newer query', async () => {
    const initial = deferred<any[]>();
    const typed = deferred<any[]>();
    searchProducts.mockReturnValueOnce(initial.promise).mockReturnValueOnce(typed.promise);

    const { getByRole, queryByText } = render(<SearchPicker />);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    fireEvent.change(getByRole('searchbox'), { target: { value: 'BVR1056' } });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(searchProducts).toHaveBeenLastCalledWith('BVR1056');

    await act(async () => {
      typed.resolve([hit('BVR1056-YSRDT')]);
      initial.resolve([hit('STALE-DEFAULT')]);
    });

    expect(queryByText('BVR1056-YSRDT')).toBeTruthy();
    expect(queryByText('STALE-DEFAULT')).toBeNull();
  });

  it('clears results and notifies when the search request fails', async () => {
    searchProducts.mockRejectedValueOnce(new Error('400'));

    render(<SearchPicker />);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(notifierError).toHaveBeenCalledTimes(1);
  });
});
