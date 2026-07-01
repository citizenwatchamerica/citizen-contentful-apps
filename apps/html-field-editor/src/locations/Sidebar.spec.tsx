import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockCma, mockSdk } from '../../test/mocks';
import Sidebar from './Sidebar';

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
  useCMA: () => mockCma,
}));

describe('Sidebar component', () => {
  it('shows empty-state note when no Rich Text fields exist', () => {
    mockSdk.contentType.fields = [];
    const { getByText } = render(<Sidebar />);
    expect(getByText(/No Rich Text fields found/)).toBeTruthy();
  });

  it('renders a convert button for each Rich Text field', () => {
    mockSdk.contentType.fields = [
      { id: 'body', name: 'Body', type: 'RichText' },
    ];
    const { getByText } = render(<Sidebar />);
    expect(getByText('Body')).toBeTruthy();
    expect(getByText('Convert & Apply')).toBeTruthy();
  });
});
