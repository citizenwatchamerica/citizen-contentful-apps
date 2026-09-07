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

const callTranslateAction = async (
  sdk: SidebarAppSDK,
  texts: string[],
  config: TranslationConfig
): Promise<string[]> => {
  // contentful-management's typed appActionCall (pinned to this app's older app-sdk) only
  // models 'create' | 'getCallDetails' | 'createWithResponse' - it predates the newer
  // 'createWithResult' convenience method (which handles polling for us), the same kind of
  // stale-type gap we hit with entry.publish's `locales` param. Cast past it rather than
  // hand-roll polling against a method the live platform already supports.
  const call = await (sdk.cma.appActionCall as any).createWithResult(
    { appActionId: TRANSLATE_APP_ACTION_ID },
    {
      parameters: {
        texts,
        sourceLocale: config.source,
        targetLocale: config.target,
        guidance: config.guidance,
      },
    }
  );

  if (call.sys.status !== 'succeeded') {
    const message =
      call.sys.status === 'failed' ? call.sys.error?.message : 'Translation timed out or was cancelled';
    throw new Error(message || 'Translation failed');
  }

  const translations = call.sys.result?.translations;
  if (!Array.isArray(translations) || translations.length !== texts.length) {
    throw new Error('Translation returned an unexpected result shape');
  }
  return translations;
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
