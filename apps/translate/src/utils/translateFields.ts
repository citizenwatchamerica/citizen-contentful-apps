import type { SidebarAppSDK } from '@contentful/app-sdk';
import { FieldControl, FieldDefinition, getFieldExclusion, getValueExclusion } from './fieldEligibility';
import { AppInstallationParameters, TranslationConfig, parseProtectedTerms } from './permissions';
import { FieldSegments, TranslateClient, toFieldSegments, translateFieldSegments } from './translateClient';

export { TRANSLATE_APP_ACTION_ID } from './translateClient';

export interface FieldTranslationOutcome {
  fieldId: string;
  fieldName: string;
}

// Translates every eligible localized text field on the open entry from config.source into
// config.target, always overwriting whatever currently exists in the target locale (the
// sidebar's confirm dialog warns about this). Bulk translation, by contrast, never overwrites.
export const translateEntryFields = async (
  sdk: SidebarAppSDK,
  config: TranslationConfig
): Promise<FieldTranslationOutcome[]> => {
  const definitions = new Map<string, FieldDefinition>(
    ((sdk.contentType?.fields ?? []) as FieldDefinition[]).map(definition => [definition.id, definition])
  );
  const controls = new Map<string, FieldControl>(
    ((sdk.editor?.editorInterface?.controls ?? []) as FieldControl[]).map(control => [control.fieldId, control])
  );

  const eligible: Array<{ field: (typeof sdk.entry.fields)[string]; segments: FieldSegments }> = [];

  for (const field of Object.values(sdk.entry.fields)) {
    if (!field.locales.includes(config.source) || !field.locales.includes(config.target)) continue;

    const definition = definitions.get(field.id) ?? { id: field.id, name: field.name, type: field.type };
    if (getFieldExclusion(definition, controls.get(field.id))) continue;

    const sourceValue = field.getValue(config.source);
    const segments = toFieldSegments(field.type, sourceValue);
    if (!segments) continue;
    if (field.type !== 'RichText' && getValueExclusion(sourceValue as string)) continue;

    eligible.push({ field, segments });
  }

  if (eligible.length === 0) return [];

  const parameters = sdk.parameters?.installation as AppInstallationParameters | undefined;
  const translatedValues = await translateFieldSegments(
    {
      // sdk.ids.app is always set for a sidebar location - it's just typed optional because
      // not every location provides it.
      cma: sdk.cma as unknown as TranslateClient,
      appDefinitionId: sdk.ids.app!,
      config,
      protectedTerms: parseProtectedTerms(parameters?.protectedTerms),
    },
    eligible.map(({ segments }) => segments)
  );

  for (const [index, { field }] of eligible.entries()) {
    await field.setValue(translatedValues[index], config.target);
  }
  await sdk.entry.save();

  return eligible.map(({ field }) => ({ fieldId: field.id, fieldName: field.name }));
};
