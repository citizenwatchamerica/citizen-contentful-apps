import { BLOCKS } from '@contentful/rich-text-types';
import { describe, expect, it, vi } from 'vitest';
import { translateEntryFields } from './translateFields';

const config = { source: 'en-US', target: 'es-US', guidance: 'avoid Spanglish' };

const makeField = (overrides: Record<string, unknown>) => ({
  id: 'field',
  name: 'Field',
  type: 'Symbol',
  locales: ['en-US', 'es-US'],
  getValue: vi.fn(),
  setValue: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const okResponse = (translations: string[]) => ({
  statusCode: 200,
  errors: [],
  response: { body: JSON.stringify({ translations }) },
});

const makeSdk = (fields: Record<string, ReturnType<typeof makeField>>, callResult: unknown) => ({
  ids: { app: 'test-app' },
  entry: { fields, save: vi.fn().mockResolvedValue(undefined) },
  cma: {
    appActionCall: {
      createWithResponse: vi.fn().mockResolvedValue(callResult),
    },
  },
});

describe('translateEntryFields', () => {
  it('translates a Symbol field and writes the result into the target locale', async () => {
    const title = makeField({ getValue: vi.fn(() => 'Hello') });
    const sdk = makeSdk({ title }, okResponse(['Hola']));

    const outcome = await translateEntryFields(sdk as any, config);

    expect(title.setValue).toHaveBeenCalledWith('Hola', 'es-US');
    expect(sdk.entry.save).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual([{ fieldId: 'field', fieldName: 'Field' }]);
  });

  it('skips fields missing the source or target locale', async () => {
    const usOnly = makeField({ locales: ['en-US'], getValue: vi.fn(() => 'Hello') });
    const sdk = makeSdk({ usOnly }, okResponse([]));

    const outcome = await translateEntryFields(sdk as any, config);

    expect(usOnly.setValue).not.toHaveBeenCalled();
    expect(outcome).toEqual([]);
    expect(sdk.entry.save).not.toHaveBeenCalled();
  });

  it('skips a field whose source value is empty', async () => {
    const empty = makeField({ getValue: vi.fn(() => '') });
    const sdk = makeSdk({ empty }, okResponse([]));

    const outcome = await translateEntryFields(sdk as any, config);

    expect(empty.setValue).not.toHaveBeenCalled();
    expect(outcome).toEqual([]);
  });

  it('walks a RichText field, translates its text nodes, and reconstructs the document', async () => {
    const document = {
      nodeType: BLOCKS.DOCUMENT,
      data: {},
      content: [
        {
          nodeType: BLOCKS.PARAGRAPH,
          data: {},
          content: [{ nodeType: 'text', value: 'Hello', marks: [], data: {} }],
        },
      ],
    };
    const body = makeField({ type: 'RichText', getValue: vi.fn(() => document) });
    const sdk = makeSdk({ body }, okResponse(['Hola']));

    await translateEntryFields(sdk as any, config);

    const [translatedDoc] = body.setValue.mock.calls[0];
    expect(translatedDoc.content[0].content[0].value).toBe('Hola');
    expect(body.setValue).toHaveBeenCalledWith(expect.anything(), 'es-US');
  });

  it('throws with the underlying error message when the App Action call fails', async () => {
    const title = makeField({ getValue: vi.fn(() => 'Hello') });
    const sdk = makeSdk(
      { title },
      {
        statusCode: 500,
        errors: [{ message: 'OpenAI key missing' }],
        response: { body: '' },
      }
    );

    await expect(translateEntryFields(sdk as any, config)).rejects.toThrow('OpenAI key missing');
  });

  it('throws when the App Action returns a mismatched-length result', async () => {
    const title = makeField({ getValue: vi.fn(() => 'Hello') });
    const sdk = makeSdk({ title }, okResponse([]));

    await expect(translateEntryFields(sdk as any, config)).rejects.toThrow(
      'unexpected result shape'
    );
  });
});
