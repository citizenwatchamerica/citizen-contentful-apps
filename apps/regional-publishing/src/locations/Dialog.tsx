import { DialogAppSDK } from '@contentful/app-sdk';
import {
  Button,
  Checkbox,
  EntityStatusBadge,
  Flex,
  List,
  ListItem,
  Paragraph,
  Subheading,
} from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useState } from 'react';
import { LocaleStatus } from '../utils/localeStatus';

interface DialogInvocationParams {
  allowedLocales: string[];
  excludedLocales: string[];
  localeStatus: Record<string, LocaleStatus>;
}

const Dialog = () => {
  const sdk = useSDK<DialogAppSDK>();
  const { allowedLocales, excludedLocales, localeStatus } =
    sdk.parameters.invocation as unknown as DialogInvocationParams;

  const [selectedLocales, setSelectedLocales] = useState<string[]>(allowedLocales);

  const toggleLocale = (locale: string, checked: boolean) => {
    setSelectedLocales(prev => (checked ? [...prev, locale] : prev.filter(l => l !== locale)));
  };

  const allSelected = selectedLocales.length === allowedLocales.length;

  return (
    <Flex flexDirection="column" gap="spacingM" padding="spacingL">
      <Paragraph>Choose which of your regions to publish:</Paragraph>

      <Flex flexDirection="column" gap="spacingXs">
        {allowedLocales.map(locale => (
          <Flex key={locale} alignItems="center" gap="spacingXs">
            <Checkbox
              id={`dialog-publish-${locale}`}
              isChecked={selectedLocales.includes(locale)}
              onChange={e => toggleLocale(locale, (e.target as HTMLInputElement).checked)}
            >
              {locale}
            </Checkbox>
            {localeStatus[locale] && <EntityStatusBadge entityStatus={localeStatus[locale]} />}
          </Flex>
        ))}
      </Flex>

      <Button
        variant="positive"
        isFullWidth
        isDisabled={selectedLocales.length === 0}
        onClick={() => sdk.close(selectedLocales)}
      >
        {allSelected
          ? `Publish all my regions (${selectedLocales.length})`
          : `Publish selected regions (${selectedLocales.length})`}
      </Button>
      <Button variant="secondary" isFullWidth onClick={() => sdk.close(null)}>
        Cancel
      </Button>

      {excludedLocales.length > 0 && (
        <Flex flexDirection="column" gap="spacingXs">
          <Subheading>Not being published</Subheading>
          <List>
            {excludedLocales.map(locale => (
              <ListItem key={locale}>
                <Flex alignItems="center" gap="spacingXs">
                  {locale}
                  {localeStatus[locale] && <EntityStatusBadge entityStatus={localeStatus[locale]} />}
                </Flex>
              </ListItem>
            ))}
          </List>
        </Flex>
      )}
    </Flex>
  );
};

export default Dialog;
