import type { SidebarAppSDK } from '@contentful/app-sdk';
import type { Document } from '@contentful/rich-text-types';
import { applyTranslatedSegments, extractTextSegments } from './richText';
import type { TranslationConfig } from './permissions';

const TRANSLATABLE_TYPES = new Set(['Symbol', 'Text', 'RichText']);
export const TRANSLATE_APP_ACTION_ID = 'translateText';

export interface FieldTranslationOutcome {
  fieldId: string;
  fieldName: string;
}

// Pulls a human-readable message out of whatever shape the failed call's body/errors take -
// Contentful doesn't document the exact JSON shape a thrown Function error lands in here.
const extractFailureMessage = (call: {
  errors?: unknown[];
  response?: { body?: string };
}): string => {
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

const callTranslateAction = async (
  sdk: SidebarAppSDK,
  texts: string[],
  config: TranslationConfig
): Promise<string[]> => {
  // The live platform only supports 'create' | 'getCallDetails' | 'createWithResponse' for
  // appActionCall (confirmed by an actual "createWithResult is not a function" error) -
  // createWithResponse triggers the App Action and waits for its response in one call, but
  // returns the older webhook-style shape (statusCode/response.body as a JSON string, plus
  // an errors array) rather than the newer structured {status, result, error}.
  // The App Action's declared parameter schema is validated against the call payload (proven
  // by an actual "The property \"texts\" is not expected" 422), and Contentful's parameter
  // types are limited to Boolean/Symbol/Number/Enum - no arrays - so everything travels as one
  // JSON-stringified `payload` Symbol parameter instead of separate fields.
  const call = await sdk.cma.appActionCall.createWithResponse(
    // sdk.ids.app is always set for a sidebar location - it's just typed optional because
    // not every location provides it.
    { appActionId: TRANSLATE_APP_ACTION_ID, appDefinitionId: sdk.ids.app! },
    {
      parameters: {
        payload: JSON.stringify({
          texts,
          sourceLocale: config.source,
          targetLocale: config.target,
          guidance: config.guidance,
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

// Translates every localized text-like field on the entry from config.source into
// config.target, always overwriting whatever currently exists in the target locale.
export const translateEntryFields = async (
  sdk: SidebarAppSDK,
  config: TranslationConfig
): Promise<FieldTranslationOutcome[]> => {
  const translatable = Object.values(sdk.entry.fields).filter(
    field =>
      TRANSLATABLE_TYPES.has(field.type) &&
      field.locales.includes(config.source) &&
      field.locales.includes(config.target)
  );

  const translated: FieldTranslationOutcome[] = [];

  for (const field of translatable) {
    const sourceValue = field.getValue(config.source);
    if (sourceValue == null) continue;

    if (field.type === 'RichText') {
      const document = sourceValue as Document;
      const segments = extractTextSegments(document);
      if (segments.every(segment => segment.trim().length === 0)) continue;

      const translations = await callTranslateAction(sdk, segments, config);
      const translatedDocument = applyTranslatedSegments(document, translations);
      await field.setValue(translatedDocument, config.target);
    } else {
      if (typeof sourceValue !== 'string' || sourceValue.trim().length === 0) continue;
      const [translatedText] = await callTranslateAction(sdk, [sourceValue], config);
      await field.setValue(translatedText, config.target);
    }

    translated.push({ fieldId: field.id, fieldName: field.name });
  }

  if (translated.length > 0) {
    await sdk.entry.save();
  }

  return translated;
};
