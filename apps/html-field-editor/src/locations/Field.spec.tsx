import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockCma, mockSdk } from '../../test/mocks';
import Field from './Field';

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
  useCMA: () => mockCma,
}));

describe('Field component', () => {
  it('shows a field-type error when the field is not Long Text', () => {
    mockSdk.field.type = 'RichText';
    const { getByText } = render(<Field />);
    expect(getByText(/Wrong field type/)).toBeTruthy();
  });

  it('renders the editor without crashing when field type is Text', () => {
    mockSdk.field.type = 'Text';
    expect(() => render(<Field />)).not.toThrow();
  });
});
