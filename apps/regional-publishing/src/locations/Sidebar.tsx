import { SidebarAppSDK } from '@contentful/app-sdk';
import { Button, Flex, Note, Subheading } from '@contentful/f36-components';
import { useAutoResizer, useSDK } from '@contentful/react-apps-toolkit';
import { useMemo, useState } from 'react';
import { getLocaleStatuses } from '../utils/localeStatus';
import { AppInstallationParameters, getAllowedLocales } from '../utils/permissions';
import { publishLocales } from '../utils/publishLocales';

type Status = 'idle' | 'publishing' | 'success' | 'error';

// contentful-management wraps API errors as an Error whose `.message` is the raw JSON
// response body — pull the human-readable `message` field out of it when present.
const extractErrorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message);
      return typeof parsed?.message === 'string' ? parsed.message : err.message;
    } catch {
      return err.message;
    }
  }
  return 'Unknown error';
};

const Sidebar = () => {
  const sdk = useSDK<SidebarAppSDK>();
  useAutoResizer();

  const [status, setStatus] = useState<Status>('idle');
  const [publishedLocales, setPublishedLocales] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const parameters = sdk.parameters.installation as AppInstallationParameters;
  const spaceLocales = sdk.locales.available;

  const allowedLocales = useMemo(
    () => getAllowedLocales(sdk.user.spaceMembership, parameters, spaceLocales),
    [sdk.user.spaceMembership, parameters, spaceLocales]
  );

  const excludedLocales = spaceLocales.filter(locale => !allowedLocales.includes(locale));

  const handlePublish = async () => {
    const localeStatus = await getLocaleStatuses(sdk.cma, sdk.ids.entry, [
      ...allowedLocales,
      ...excludedLocales,
    ]);

    // Mirrors the native Publish button's review step: the user sees exactly which of
    // their regions are about to go out and can narrow the selection before confirming.
    const selectedLocales = await sdk.dialogs.openCurrentApp({
      title: 'Publish regions',
      width: 'small',
      minHeight: 450,
      allowHeightOverflow: true,
      parameters: { allowedLocales, excludedLocales, localeStatus },
    });

    if (!selectedLocales || selectedLocales.length === 0) {
      return;
    }

    setStatus('publishing');
    try {
      const { version } = sdk.entry.getSys();
      await publishLocales(sdk.cma, sdk.ids.entry, version, selectedLocales);
      setPublishedLocales(selectedLocales);
      setStatus('success');
    } catch (err) {
      setErrorMessage(extractErrorMessage(err));
      setStatus('error');
    }
  };

  if (allowedLocales.length === 0) {
    return (
      <Note variant="warning">
        Your role isn't configured to publish any locales for this space. Contact an admin to
        update the Regional Publishing app configuration.
      </Note>
    );
  }

  return (
    <Flex flexDirection="column" gap="spacingM">
      <Subheading>Regional Publishing</Subheading>
      <Button
        variant="positive"
        isFullWidth
        isDisabled={status === 'publishing'}
        isLoading={status === 'publishing'}
        onClick={handlePublish}
      >
        Publish
      </Button>
      {status === 'success' && <Note variant="positive">Published {publishedLocales.join(', ')}.</Note>}
      {status === 'error' && <Note variant="negative">Publish failed: {errorMessage}</Note>}
    </Flex>
  );
};

export default Sidebar;
