import { SidebarAppSDK } from '@contentful/app-sdk';
import { Button, Flex, Note, Select, Subheading, Text, TextLink } from '@contentful/f36-components';
import tokens from '@contentful/f36-tokens';
import { useAutoResizer, useSDK } from '@contentful/react-apps-toolkit';
import { css } from 'emotion';
import { useMemo, useState } from 'react';
import { AppInstallationParameters, getTranslationConfigs } from '../utils/permissions';
import { FieldTranslationOutcome, translateEntryFields } from '../utils/translateFields';

type Status = 'idle' | 'translating' | 'success' | 'error';

interface ExtractedError {
  message: string;
  // Only populated when Contentful reports more than one field/locale issue at once - a single
  // issue is folded straight into `message` instead, so simple errors stay a one-liner.
  details: string[];
}

// Forma36's Button has no built-in orange variant (blue/green/red only) - orange reads as
// "this is an interstitial/in-progress step", distinct from Regional Publishing's green
// "final" Publish action, so it's layered on top of `primary` via Forma36's own warning tokens.
const orangeButtonStyles = css({
  backgroundColor: tokens.colorWarning,
  borderColor: tokens.colorWarning,
  '&:hover:not(:disabled)': {
    backgroundColor: tokens.orange600,
    borderColor: tokens.orange600,
  },
  '&:disabled': {
    backgroundColor: tokens.orange200,
    borderColor: tokens.orange200,
  },
});

// Mirrors the same non-Error rejection shape handling as the Regional Publishing app -
// sdk.cma calls are proxied through the app iframe's postMessage bridge, which can reject
// with a plain object instead of a real Error instance.
const extractErrorMessage = (err: unknown): ExtractedError => {
  if (typeof err === 'string') return { message: err, details: [] };

  const rawMessage = err instanceof Error ? err.message : (err as { message?: unknown })?.message;

  if (typeof rawMessage === 'string') {
    try {
      const parsed = JSON.parse(rawMessage);
      if (typeof parsed?.message !== 'string') return { message: rawMessage, details: [] };

      // Contentful's top-level message is a generic label ("Validation error") - the actual
      // reason(s) live in details.errors[], e.g. { details: 'The property "columns" is required here' }.
      const detailErrors: string[] = Array.isArray(parsed?.details?.errors)
        ? parsed.details.errors.map((e: { details?: string }) => e?.details).filter(Boolean)
        : [];

      if (detailErrors.length === 0) return { message: parsed.message, details: [] };
      if (detailErrors.length === 1) return { message: `${parsed.message}: ${detailErrors[0]}`, details: [] };
      return { message: parsed.message, details: detailErrors };
    } catch {
      return { message: rawMessage, details: [] };
    }
  }

  if (err && typeof err === 'object') {
    try {
      return { message: JSON.stringify(err), details: [] };
    } catch {
      // fall through
    }
  }

  return { message: 'Unknown error', details: [] };
};

const ErrorNote = ({ prefix, error }: { prefix: string; error: ExtractedError }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <Note variant="negative">
      {prefix}: {error.message}
      {error.details.length > 0 && (
        <>
          {' '}
          <TextLink as="button" onClick={() => setShowDetails(v => !v)}>
            {showDetails ? 'Hide details' : 'Show details'}
          </TextLink>
          {showDetails && (
            <ul>
              {error.details.map((detail, index) => (
                <li key={index}>
                  <Text fontSize="fontSizeS">{detail}</Text>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Note>
  );
};

const Sidebar = () => {
  const sdk = useSDK<SidebarAppSDK>();
  useAutoResizer();

  const [status, setStatus] = useState<Status>('idle');
  const [translatedFields, setTranslatedFields] = useState<FieldTranslationOutcome[]>([]);
  const [translateError, setTranslateError] = useState<ExtractedError | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const parameters = sdk.parameters.installation as AppInstallationParameters;

  const configs = useMemo(
    () => getTranslationConfigs(sdk.user.spaceMembership, parameters),
    [sdk.user.spaceMembership, parameters]
  );

  const config = configs[selectedIndex];

  const localeName = (locale: string) => sdk.locales.names[locale] ?? locale;

  const handleTranslate = async () => {
    if (!config) return;

    // Cloned entries can carry over content that already looks right in the target locale
    // (copied verbatim from whatever was cloned) - making it easy to assume nothing needs
    // translating when it actually does, or the reverse. Confirming the exact source/target
    // locales up front, with an explicit overwrite warning, catches both cases before it runs.
    const confirmed = await sdk.dialogs.openConfirm({
      title: 'Translate this entry?',
      message: `This translates from ${localeName(config.source)} to ${localeName(
        config.target
      )}, overwriting any existing content currently in ${localeName(config.target)}.`,
      confirmLabel: 'Translate',
      cancelLabel: 'Cancel',
      intent: 'primary',
    });
    if (!confirmed) return;

    setStatus('translating');
    try {
      const outcome = await translateEntryFields(sdk, config);
      setTranslatedFields(outcome);
      setStatus('success');
    } catch (err) {
      setTranslateError(extractErrorMessage(err));
      setStatus('error');
    }
  };

  if (configs.length === 0) {
    return (
      <Note variant="warning">
        Your role isn't configured for translation. Contact an admin to update the Translate app
        configuration.
      </Note>
    );
  }

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Subheading marginBottom="none">Translate</Subheading>
      {configs.length > 1 && (
        <Select
          value={String(selectedIndex)}
          onChange={e => {
            setSelectedIndex(Number(e.target.value));
            setStatus('idle');
          }}
        >
          {configs.map((c, index) => (
            <Select.Option key={index} value={String(index)}>
              {localeName(c.source)} → {localeName(c.target)}
            </Select.Option>
          ))}
        </Select>
      )}
      <Button
        variant="primary"
        className={orangeButtonStyles}
        isFullWidth
        isDisabled={status === 'translating'}
        isLoading={status === 'translating'}
        onClick={handleTranslate}
      >
        Translate
      </Button>
      {status === 'success' &&
        (translatedFields.length > 0 ? (
          <Note variant="positive">
            Translated {translatedFields.length} field{translatedFields.length === 1 ? '' : 's'} from{' '}
            {localeName(config.source)} to {localeName(config.target)}.
          </Note>
        ) : (
          <Note variant="neutral">
            Nothing to translate — {localeName(config.source)} had no text to copy over.
          </Note>
        ))}
      {status === 'error' && translateError && <ErrorNote prefix="Translation failed" error={translateError} />}
    </Flex>
  );
};

export default Sidebar;
