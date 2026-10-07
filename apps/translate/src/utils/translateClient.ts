import type { Document } from '@contentful/rich-text-types';
import { applyTranslatedSegments, extractTextSegments } from './richText';
import type { TranslationConfig } from './permissions';
import { withRetry } from './retry';

export const TRANSLATE_APP_ACTION_ID = 'translateText';

// Keeps each App Action call (and so each OpenAI request inside the Function) comfortably small
// enough to finish within the Function's time limit.
const MAX_SEGMENTS_PER_CALL = 60;
const MAX_CHARACTERS_PER_CALL = 6000;

interface AppActionCallResult {
  statusCode: number;
  errors?: unknown[];
  response: { body: string };
}

// The slice of the CMA client both the sidebar and the page location share.
export interface TranslateClient {
  appActionCall: {
    createWithResponse: (
      params: { appActionId: string; appDefinitionId: string },
      payload: { parameters: Record<string, string> }
    ) => Promise<AppActionCallResult>;
  };
}

export interface TranslateRequest {
  cma: TranslateClient;
  appDefinitionId: string;
  config: TranslationConfig;
  protectedTerms: string[];
}

// Pulls a human-readable message out of whatever shape the failed call's body/errors take -
// Contentful doesn't document the exact JSON shape a thrown Function error lands in here.
const extractFailureMessage = (call: AppActionCallResult): string => {
  if (Array.isArray(call.errors) && call.errors.length > 0) {
    const first = call.errors[0] as { message?: string; detail?: string } | string;
    if (typeof first === 'string') return first;
    if (first?.message) return first.message;
    if (first?.detail) return first.detail;
  }

  if (typeof call.response?.body === 'string') {
    try {
      const parsed = JSON.parse(call.response.body);
      if (typeof parsed?.message === 'string') return parsed.message;
      if (typeof parsed?.error === 'string') return parsed.error;
    } catch {
      if (call.response.body.trim().length > 0) return call.response.body;
    }
  }

  return 'Translation failed';
};

const callTranslateAction = async (request: TranslateRequest, texts: string[]): Promise<string[]> => {
  // The live platform only supports 'create' | 'getCallDetails' | 'createWithResponse' for
  // appActionCall (confirmed by an actual "createWithResult is not a function" error) -
  // createWithResponse triggers the App Action and waits for its response in one call, but
  // returns the older webhook-style shape (statusCode/response.body as a JSON string, plus
  // an errors array) rather than the newer structured {status, result, error}.
  // The App Action's declared parameter schema is validated against the call payload (proven
  // by an actual "The property \"texts\" is not expected" 422), and Contentful's parameter
  // types are limited to Boolean/Symbol/Number/Enum - no arrays - so everything travels as one
  // JSON-stringified `payload` Symbol parameter instead of separate fields.
  const call = await request.cma.appActionCall.createWithResponse(
    { appActionId: TRANSLATE_APP_ACTION_ID, appDefinitionId: request.appDefinitionId },
    {
      parameters: {
        payload: JSON.stringify({
          texts,
          sourceLocale: request.config.source,
          targetLocale: request.config.target,
          guidance: request.config.guidance,
          protectedTerms: request.protectedTerms,
        }),
      },
    }
  );

  const succeeded = call.statusCode >= 200 && call.statusCode < 300 && (call.errors?.length ?? 0) === 0;
  if (!succeeded) {
    throw new Error(extractFailureMessage(call));
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(call.response.body);
  } catch {
    throw new Error('Translation response was not valid JSON.');
  }

  const translations = (parsedBody as { translations?: unknown })?.translations;
  if (!Array.isArray(translations) || translations.length !== texts.length) {
    throw new Error('Translation returned an unexpected result shape');
  }
  return translations as string[];
};

const chunkTexts = (texts: string[]): string[][] => {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentCharacters = 0;
  for (const text of texts) {
    const wouldOverflow =
      current.length >= MAX_SEGMENTS_PER_CALL || currentCharacters + text.length > MAX_CHARACTERS_PER_CALL;
    if (current.length > 0 && wouldOverflow) {
      chunks.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push(text);
    currentCharacters += text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
};

// Translates any number of strings, split into right-sized App Action calls, retrying
// rate limits and transient failures. Output order always matches input order.
export const translateTexts = async (request: TranslateRequest, texts: string[]): Promise<string[]> => {
  const translated: string[] = [];
  for (const chunk of chunkTexts(texts)) {
    translated.push(...(await withRetry(() => callTranslateAction(request, chunk))));
  }
  return translated;
};

// A field value's translatable strings, plus how to rebuild the value from their translations.
// Rich text is walked node by node so marks, links, embeds and structure are never touched.
export interface FieldSegments {
  segments: string[];
  rebuild: (translations: string[]) => unknown;
}

export const toFieldSegments = (type: string, value: unknown): FieldSegments | null => {
  if (value == null) return null;

  if (type === 'RichText') {
    const document = value as Document;
    if (!Array.isArray(document.content)) return null;
    const segments = extractTextSegments(document);
    if (segments.every(segment => segment.trim().length === 0)) return null;
    return { segments, rebuild: translations => applyTranslatedSegments(document, translations) };
  }

  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return { segments: [value], rebuild: ([translatedText]) => translatedText };
};

// Translates several fields' segments in as few calls as possible and hands back each field's
// rebuilt value, in the same order as the input.
export const translateFieldSegments = async (
  request: TranslateRequest,
  fields: FieldSegments[]
): Promise<unknown[]> => {
  const allSegments = fields.flatMap(field => field.segments);
  const translations = await translateTexts(request, allSegments);

  let offset = 0;
  return fields.map(field => {
    const slice = translations.slice(offset, offset + field.segments.length);
    offset += field.segments.length;
    return field.rebuild(slice);
  });
};
