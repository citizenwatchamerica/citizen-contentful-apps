import { DialogAppSDK } from '@contentful/app-sdk';
import {
  Button,
  Checkbox,
  EntityStatusBadge,
  Flex,
  List,
  ListItem,
  Note,
  Paragraph,
  Subheading,
} from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useState } from 'react';
import { LocaleStatus } from '../utils/localeStatus';

export type DialogMode = 'publish' | 'unpublish';

interface DialogInvocationParams {
  mode?: DialogMode;
  // Unpublish only: the space default locale and every locale currently live (all teams').
  defaultLocale?: string;
  liveLocales?: string[];
  allowedLocales: string[];
  excludedLocales: string[];
  localeStatus: Record<string, LocaleStatus>;
  localeNames: Record<string, string>;
}

const copy = {
  publish: {
    prompt: 'Choose which of your regions to publish:',
    all: 'Publish all my regions',
    selected: 'Publish selected regions',
    excluded: 'Not being published',
  },
  unpublish: {
    prompt:
      'Choose which of your regions to unpublish. If this unpublishes every region still published, the whole entry becomes unpublished.',
    all: 'Unpublish all my regions',
    selected: 'Unpublish selected regions',
    excluded: 'Not affected',
  },
};

const Dialog = () => {
  const sdk = useSDK<DialogAppSDK>();
  const {
    mode = 'publish',
    defaultLocale,
    liveLocales = [],
    allowedLocales,
    excludedLocales,
    localeStatus,
    localeNames,
  } = sdk.parameters.invocation as unknown as DialogInvocationParams;
  const text = copy[mode];

  // Publishing starts with every region ticked; unpublishing takes content down, so the user
  // has to opt each region in.
  const [selectedLocales, setSelectedLocales] = useState<string[]>(
    mode === 'publish' ? allowedLocales : []
  );

  const toggleLocale = (locale: string, checked: boolean) => {
    setSelectedLocales(prev => (checked ? [...prev, locale] : prev.filter(l => l !== locale)));
  };

  const allSelected = selectedLocales.length === allowedLocales.length;

  // Contentful refuses to unpublish the default locale while any other locale stays live, so
  // flag it here rather than letting the request fail.
  const defaultLocaleBlocked =
    mode === 'unpublish' &&
    !!defaultLocale &&
    selectedLocales.includes(defaultLocale) &&
    !liveLocales.every(locale => selectedLocales.includes(locale));

  return (
    <Flex flexDirection="column" gap="spacingM" padding="spacingL">
      <Paragraph>{text.prompt}</Paragraph>

      <Flex flexDirection="column" gap="spacingXs">
        {allowedLocales.map(locale => (
          <Flex key={locale} alignItems="center" gap="spacingXs">
            <Checkbox
              id={`dialog-${mode}-${locale}`}
              isChecked={selectedLocales.includes(locale)}
              onChange={e => toggleLocale(locale, (e.target as HTMLInputElement).checked)}
            >
              {localeNames[locale] ?? locale}
            </Checkbox>
            {localeStatus[locale] && <EntityStatusBadge entityStatus={localeStatus[locale]} />}
          </Flex>
        ))}
      </Flex>

      {defaultLocaleBlocked && defaultLocale && (
        <Note variant="warning">
          {localeNames[defaultLocale] ?? defaultLocale} is the default locale, so it can only be
          unpublished together with every other published region.
        </Note>
      )}

      <Button
        variant={mode === 'publish' ? 'positive' : 'negative'}
        isFullWidth
        isDisabled={selectedLocales.length === 0 || defaultLocaleBlocked}
        onClick={() => sdk.close(selectedLocales)}
      >
        {`${allSelected ? text.all : text.selected} (${selectedLocales.length})`}
      </Button>
      <Button variant="secondary" isFullWidth onClick={() => sdk.close(null)}>
        Cancel
      </Button>

      {excludedLocales.length > 0 && (
        <Flex flexDirection="column" gap="spacingXs">
          <Subheading>{text.excluded}</Subheading>
          <List>
            {excludedLocales.map(locale => (
              <ListItem key={locale}>
                <Flex alignItems="center" gap="spacingXs">
                  {localeNames[locale] ?? locale}
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
