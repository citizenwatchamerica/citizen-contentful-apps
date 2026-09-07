import type {
  AppActionRequest,
  FunctionEventContext,
  FunctionEventHandler,
  FunctionTypeEnum,
} from '@contentful/node-apps-toolkit';

// The App Action's declared call parameters are validated against its manifest schema, which
// only supports Boolean/Symbol/Number/Enum values - no arrays - so the whole payload (including
// the texts array) travels as one JSON-stringified Symbol parameter instead of separate fields.
type TranslateParams = {
  payload: string;
};

type TranslatePayload = {
  texts: string[];
  sourceLocale: string;
  targetLocale: string;
  guidance?: string;
};

type InstallationParameters = {
  openaiApiKey?: string;
};

const buildSystemPrompt = (sourceLocale: string, targetLocale: string, guidance?: string): string =>
  [
    'You are a professional localization translator.',
    `Translate each string in the input JSON array from locale "${sourceLocale}" to locale "${targetLocale}".`,
    'Preserve meaning, tone, and any formatting characters (HTML tags, Markdown, punctuation) exactly.',
    'An empty string in the input must stay an empty string in the output - never invent content.',
    guidance ? `Additional guidance: ${guidance}` : '',
    'Respond with ONLY a JSON object of the shape {"translations": string[]}, whose array has exactly ' +
      'the same length and order as the input array. Include no other text.',
  ]
    .filter(Boolean)
    .join('\n');

/**
 * App Action Function backing the Translate app's sidebar button.
 *
 * Receives a batch of source-locale strings (one field's worth, or every text node of a
 * rich text field) and returns them translated into the target locale via OpenAI.
 */
export const handler: FunctionEventHandler<FunctionTypeEnum.AppActionCall> = async (
  event: AppActionRequest<'Custom', TranslateParams>,
  context: FunctionEventContext<InstallationParameters>
) => {
  let payload: TranslatePayload;
  try {
    payload = JSON.parse(event.body.payload);
  } catch {
    throw new Error('Payload was not valid JSON.');
  }
  const { texts, sourceLocale, targetLocale, guidance } = payload;
  const apiKey = context.appInstallationParameters?.openaiApiKey;

  if (!apiKey) {
    throw new Error('OpenAI API key is not configured for this app installation.');
  }
  if (!Array.isArray(texts) || texts.length === 0) {
    return { translations: [] };
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(sourceLocale, targetLocale, guidance) },
        { role: 'user', content: JSON.stringify({ texts }) },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenAI response did not include message content.');
  }

  let parsed: { translations?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI response was not valid JSON.');
  }

  if (!Array.isArray(parsed.translations) || parsed.translations.length !== texts.length) {
    throw new Error('OpenAI response did not include a translations array matching the input length.');
  }

  return { translations: parsed.translations };
};
