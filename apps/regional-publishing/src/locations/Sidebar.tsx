import { SidebarAppSDK } from '@contentful/app-sdk';
import { Button, Flex, Note, Paragraph, Subheading } from '@contentful/f36-components';
import { useAutoResizer, useSDK } from '@contentful/react-apps-toolkit';
import { useMemo, useState } from 'react';
import { AppInstallationParameters, getAllowedLocales } from '../utils/permissions';
import { publishLocales } from '../utils/publishLocales';

type Status = 'idle' | 'publishing' | 'success' | 'error';

const Sidebar = () => {
  const sdk = useSDK<SidebarAppSDK>();
  useAutoResizer();

  const [status, setStatus] = useState<Status>('idle');

  const parameters = sdk.parameters.installation as AppInstallationParameters;
  const spaceLocales = sdk.locales.available;

  const allowedLocales = useMemo(
    () => getAllowedLocales(sdk.user.spaceMembership, parameters, spaceLocales),
    [sdk.user.spaceMembership, parameters, spaceLocales]
  );

  const excludedLocales = spaceLocales.filter(locale => !allowedLocales.includes(locale));

  const handlePublish = async () => {
    setStatus('publishing');
    try {
      const { version } = sdk.entry.getSys();
      await publishLocales(sdk.cma, sdk.ids.entry, version, allowedLocales);
      setStatus('success');
    } catch {
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
      <Paragraph>This will publish: {allowedLocales.join(', ')}</Paragraph>
      {excludedLocales.length > 0 && (
        <Note variant="neutral">
          Not affected by this publish: {excludedLocales.join(', ')}
        </Note>
      )}
      <Button
        variant="primary"
        isDisabled={status === 'publishing'}
        isLoading={status === 'publishing'}
        onClick={handlePublish}
      >
        Publish
      </Button>
      {status === 'success' && (
        <Note variant="positive">Published {allowedLocales.join(', ')}.</Note>
      )}
      {status === 'error' && (
        <Note variant="negative">Publish failed. Please try again.</Note>
      )}
    </Flex>
  );
};

export default Sidebar;
