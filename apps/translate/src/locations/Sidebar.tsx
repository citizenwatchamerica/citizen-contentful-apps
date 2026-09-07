import { SidebarAppSDK } from '@contentful/app-sdk';
import { Button, Flex, Note, Subheading } from '@contentful/f36-components';
import tokens from '@contentful/f36-tokens';
import { useAutoResizer, useSDK } from '@contentful/react-apps-toolkit';
import { css } from 'emotion';
import { useMemo, useState } from 'react';
import { AppInstallationParameters, getTranslationConfig } from '../utils/permissions';
import { FieldTranslationOutcome, translateEntryFields } from '../utils/translateFields';

type Status = 'idle' | 'translating' | 'success' | 'error';

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
const extractErrorMessage = (err: unknown): string => {
  if (typeof err === 'string') return err;

  const rawMessage = err instanceof Error ? err.message : (err as { message?: unknown })?.message;

  if (typeof rawMessage === 'string') {
    try {
      const parsed = JSON.parse(rawMessage);
      return typeof parsed?.message === 'string' ? parsed.message : rawMessage;
    } catch {
      return rawMessage;
    }
  }

  if (err && typeof err === 'object') {
    try {
      return JSON.stringify(err);
    } catch {
      // fall through
    }
  }

  return 'Unknown error';
};

const Sidebar = () => {
  const sdk = useSDK<SidebarAppSDK>();
  useAutoResizer();

  const [status, setStatus] = useState<Status>('idle');
  const [translatedFields, setTranslatedFields] = useState<FieldTranslationOutcome[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const parameters = sdk.parameters.installation as AppInstallationParameters;

  const config = useMemo(
    () => getTranslationConfig(sdk.user.spaceMembership, parameters),
    [sdk.user.spaceMembership, parameters]
  );

  const handleTranslate = async () => {
    if (!config) return;

    setStatus('translating');
    try {
      const outcome = await translateEntryFields(sdk, config);
      setTranslatedFields(outcome);
      setStatus('success');
    } catch (err) {
      setErrorMessage(extractErrorMessage(err));
      setStatus('error');
    }
  };

  if (!config) {
    return (
      <Note variant="warning">
        Your role isn't configured for translation. Contact an admin to update the Translate app
        configuration.
      </Note>
    );
  }

  const sourceName = sdk.locales.names[config.source] ?? config.source;
  const targetName = sdk.locales.names[config.target] ?? config.target;

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Subheading>Translate</Subheading>
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
            {sourceName} to {targetName}.
          </Note>
        ) : (
          <Note variant="neutral">Nothing to translate — {sourceName} had no text to copy over.</Note>
        ))}
      {status === 'error' && <Note variant="negative">Translation failed: {errorMessage}</Note>}
    </Flex>
  );
};

export default Sidebar;
