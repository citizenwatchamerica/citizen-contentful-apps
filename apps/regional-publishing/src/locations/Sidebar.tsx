import { SidebarAppSDK } from '@contentful/app-sdk';
import { Button, Checkbox, Flex, Note, Paragraph, Subheading, TextLink } from '@contentful/f36-components';
import { useAutoResizer, useSDK } from '@contentful/react-apps-toolkit';
import { useEffect, useMemo, useState } from 'react';
import { AppInstallationParameters, getAllowedLocales } from '../utils/permissions';
import { publishLocales } from '../utils/publishLocales';

type Status = 'idle' | 'publishing' | 'success' | 'error';

const Sidebar = () => {
  const sdk = useSDK<SidebarAppSDK>();
  useAutoResizer();

  const [status, setStatus] = useState<Status>('idle');
  const [publishedLocales, setPublishedLocales] = useState<string[]>([]);

  const parameters = sdk.parameters.installation as AppInstallationParameters;
  const spaceLocales = sdk.locales.available;

  const allowedLocales = useMemo(
    () => getAllowedLocales(sdk.user.spaceMembership, parameters, spaceLocales),
    [sdk.user.spaceMembership, parameters, spaceLocales]
  );

  const excludedLocales = spaceLocales.filter(locale => !allowedLocales.includes(locale));

  // Defaults to every locale the user is responsible for; unchecking narrows the publish.
  const [selectedLocales, setSelectedLocales] = useState<string[]>(allowedLocales);

  useEffect(() => {
    setSelectedLocales(allowedLocales);
  }, [allowedLocales]);

  const toggleLocale = (locale: string, checked: boolean) => {
    setSelectedLocales(prev => (checked ? [...prev, locale] : prev.filter(l => l !== locale)));
  };

  const allSelected = selectedLocales.length === allowedLocales.length;

  const handlePublish = async () => {
    setStatus('publishing');
    try {
      const { version } = sdk.entry.getSys();
      await publishLocales(sdk.cma, sdk.ids.entry, version, selectedLocales);
      setPublishedLocales(selectedLocales);
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
      <Paragraph>You're responsible for: {allowedLocales.join(', ')}</Paragraph>

      <Flex flexDirection="column" gap="spacingXs">
        {allowedLocales.map(locale => (
          <Checkbox
            key={locale}
            id={`publish-${locale}`}
            isChecked={selectedLocales.includes(locale)}
            onChange={e => toggleLocale(locale, (e.target as HTMLInputElement).checked)}
          >
            {locale}
          </Checkbox>
        ))}
      </Flex>

      <TextLink as="button" onClick={() => setSelectedLocales(allSelected ? [] : allowedLocales)}>
        {allSelected ? 'Select none' : 'Select all'}
      </TextLink>

      {excludedLocales.length > 0 && (
        <Note variant="neutral">Not affected by this publish: {excludedLocales.join(', ')}</Note>
      )}

      <Button
        variant="positive"
        isDisabled={status === 'publishing' || selectedLocales.length === 0}
        isLoading={status === 'publishing'}
        onClick={handlePublish}
      >
        {allSelected
          ? `Publish all my regions (${selectedLocales.length})`
          : `Publish selected regions (${selectedLocales.length})`}
      </Button>
      {status === 'success' && <Note variant="positive">Published {publishedLocales.join(', ')}.</Note>}
      {status === 'error' && <Note variant="negative">Publish failed. Please try again.</Note>}
    </Flex>
  );
};

export default Sidebar;
