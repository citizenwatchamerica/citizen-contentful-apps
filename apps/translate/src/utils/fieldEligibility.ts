// Every rule that decides whether a field is customer-facing copy worth sending to the
// translator lives here, so the sidebar and bulk translation exclude exactly the same things
// and the list can be maintained in one place.

export const TRANSLATABLE_TYPES = new Set(['Symbol', 'Text', 'RichText']);

export interface FieldDefinition {
  id: string;
  name?: string;
  type: string;
  localized?: boolean;
  disabled?: boolean;
  omitted?: boolean;
  validations?: Array<Record<string, unknown>>;
}

export interface FieldControl {
  fieldId: string;
  widgetId?: string;
  widgetNamespace?: string;
  settings?: { helpText?: string };
}

// Matched against the field's API ID. Structural values (IDs, links, layout settings) are often
// localized only so a region can point somewhere different - they are never prose to translate.
export const EXCLUDED_FIELD_ID_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^internal/i, reason: 'Internal name' },
  { pattern: /(^id$|[a-z0-9]Id$|_id$)/, reason: 'Identifier' },
  { pattern: /sku|modelNumber/i, reason: 'SKU / model number' },
  { pattern: /slug/i, reason: 'Slug' },
  { pattern: /(url|href|link|anchor)/i, reason: 'URL / link' },
  { pattern: /e-?mail/i, reason: 'Email address' },
  { pattern: /code$/i, reason: 'Code' },
  { pattern: /sfcc|connector/i, reason: 'SFCC / connector configuration' },
  { pattern: /(width|height|alignment|variant|colou?r|theme|layout)$/i, reason: 'Layout setting' },
  { pattern: /keywords$/i, reason: 'SEO keywords' },
];

// Built-in editors that only ever hold a URL, slug, or one of a fixed set of values.
export const EXCLUDED_BUILTIN_WIDGETS = new Set(['urlEditor', 'slugEditor', 'dropdown', 'radio', 'checkbox']);

const SYSTEM_HELP_TEXT = /\bsystem\b|do not edit|don't edit|not editable/i;

// Returns why a field must never be translated, or null if it holds translatable copy.
export const getFieldExclusion = (field: FieldDefinition, control?: FieldControl): string | null => {
  if (!TRANSLATABLE_TYPES.has(field.type)) return `Not a text field (${field.type})`;
  if (field.localized === false) return 'Not localized';
  if (field.disabled || field.omitted) return 'Disabled or hidden field';

  for (const { pattern, reason } of EXCLUDED_FIELD_ID_PATTERNS) {
    if (pattern.test(field.id)) return reason;
  }

  if (control?.widgetNamespace && control.widgetNamespace !== 'builtin') {
    return 'Edited by a custom app (e.g. SFCC connector)';
  }
  if (control?.widgetId && EXCLUDED_BUILTIN_WIDGETS.has(control.widgetId)) {
    return `Structured editor (${control.widgetId})`;
  }
  if (control?.settings?.helpText && SYSTEM_HELP_TEXT.test(control.settings.helpText)) {
    return 'Marked as system / do not edit';
  }

  const validations = field.validations ?? [];
  if (validations.some(validation => 'in' in validation)) return 'Fixed set of allowed values';
  if (validations.some(validation => 'regexp' in validation)) return 'Pattern-validated value';

  return null;
};

const URL_VALUE = /^(https?:\/\/|www\.|mailto:|tel:|\/)\S*$/i;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A single token mixing letters with digits/punctuation, e.g. "BQ1046-58A" or "plp_hero_2".
const IDENTIFIER_VALUE = /^(?=\S*[\d_-])[A-Za-z0-9._/#-]+$/;

// Value-level safety net for Symbol/Text fields whose content model doesn't reveal that they
// hold a URL, email or code. Rich text is never value-excluded - its links live in node data.
export const getValueExclusion = (value: string): string | null => {
  const trimmed = value.trim();
  if (URL_VALUE.test(trimmed)) return 'Value is a URL';
  if (EMAIL_VALUE.test(trimmed)) return 'Value is an email address';
  if (IDENTIFIER_VALUE.test(trimmed)) return 'Value looks like a code or identifier';
  return null;
};
