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
  Text,
} from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useState } from 'react';
import type { LinkedItem } from '../utils/linkedContent';
import { LocaleStatus } from '../utils/localeStatus';

export type DialogMode = 'publish' | 'unpublish';

export interface PublishSelection {
  locales: string[];
  linkedIds: string[];
}

interface DialogInvocationParams {
  mode?: DialogMode;
  // The space default locale. Unpublish always gets it; publish gets it with `sharedFieldChanges`.
  defaultLocale?: string;
  // Publish only: this entry's non-localized fields with unpublished changes, which only go live
  // with the default locale.
  sharedFieldChanges?: string[];
  liveLocales?: string[];
  // Publish only: locales that must go out with this publish and can't be unticked.
  requiredLocales?: string[];
  // Publish only: locales the user may add to this publish but that start unticked.
  optionalLocales?: string[];
  // Publish only: draft/changed content the entry links to, offered for publishing alongside it.
  linkedItems?: LinkedItem[];
  linkedIncomplete?: boolean;
  fieldNames?: Record<string, string>;
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
    requiredLocales = [],
    optionalLocales = [],
    sharedFieldChanges = [],
    linkedItems = [],
    linkedIncomplete = false,
    fieldNames = {},
    allowedLocales,
    excludedLocales,
    localeStatus,
    localeNames,
  } = sdk.parameters.invocation as unknown as DialogInvocationParams;
  const text = copy[mode];

  // Publishing starts with every region ticked except optional ones - unless the entry has shared-
  // field changes, which need the default locale; unpublishing takes content down, so the user has
  // to opt each region in.
  const [selectedLocales, setSelectedLocales] = useState<string[]>(
    mode === 'publish'
      ? allowedLocales.filter(
          locale =>
            !optionalLocales.includes(locale) || (sharedFieldChanges.length > 0 && locale === defaultLocale)
        )
      : []
  );
  const defaultLocaleName = defaultLocale ? localeNames[defaultLocale] ?? defaultLocale : '';

  const toggleLocale = (locale: string, checked: boolean) => {
    setSelectedLocales(prev => (checked ? [...prev, locale] : prev.filter(l => l !== locale)));
  };

  // Linked items start ticked; only the ones the user unticks are tracked.
  const [uncheckedLinkedIds, setUncheckedLinkedIds] = useState<string[]>([]);
  const toggleLinked = (id: string, checked: boolean) => {
    setUncheckedLinkedIds(prev => (checked ? prev.filter(uncheckedId => uncheckedId !== id) : [...prev, id]));
  };

  // An item linked only in regions that aren't ticked won't show anywhere new, so it's hidden.
  const visibleLinkedItems = linkedItems.filter(item =>
    item.locales.some(locale => selectedLocales.includes(locale))
  );
  const selectedLinkedIds = visibleLinkedItems
    .filter(item => !uncheckedLinkedIds.includes(item.id))
    .map(item => item.id);

  const linkedItemsByField = visibleLinkedItems.reduce<Record<string, LinkedItem[]>>((groups, item) => {
    const fieldId = item.fieldIds[0] ?? '';
    return { ...groups, [fieldId]: [...(groups[fieldId] ?? []), item] };
  }, {});

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
              isDisabled={requiredLocales.includes(locale)}
              onChange={e => toggleLocale(locale, (e.target as HTMLInputElement).checked)}
            >
              {localeNames[locale] ?? locale}
            </Checkbox>
            {localeStatus[locale] && <EntityStatusBadge entityStatus={localeStatus[locale]} />}
          </Flex>
        ))}
      </Flex>

      {requiredLocales.length > 0 && (
        <Note variant="neutral">
          {requiredLocales.map(locale => localeNames[locale] ?? locale).join(', ')} has to be
          included, either because this entry has never been published or because its content is
          shared by every region.
        </Note>
      )}

      {mode === 'publish' && visibleLinkedItems.length > 0 && (
        <Flex flexDirection="column" gap="spacingXs">
          <Subheading marginBottom="none">
            Also publish linked content ({selectedLinkedIds.length} of {visibleLinkedItems.length})
          </Subheading>
          <Text fontSize="fontSizeS" fontColor="gray600">
            These are referenced by this entry and have unpublished changes. Untick anything that
            isn&apos;t ready - it stays as it is.
          </Text>
          {Object.entries(linkedItemsByField).map(([fieldId, items]) => (
            <Flex key={fieldId} flexDirection="column" gap="spacingXs">
              <Text fontWeight="fontWeightDemiBold">{fieldNames[fieldId] ?? fieldId}</Text>
              {items.map(item => (
                <Flex key={item.id} flexDirection="column">
                  <Flex alignItems="center" gap="spacingXs">
                    <Checkbox
                      id={`dialog-linked-${item.id}`}
                      isChecked={!uncheckedLinkedIds.includes(item.id)}
                      onChange={e => toggleLinked(item.id, (e.target as HTMLInputElement).checked)}
                    >
                      {item.title}
                      {item.type === 'Asset' && ' (media)'}
                    </Checkbox>
                    <EntityStatusBadge entityStatus={item.status} />
                  </Flex>
                  {item.sharedFieldChanges.length > 0 && (
                    <Text fontSize="fontSizeS" fontColor="gray600">
                      Shared fields changed: {item.sharedFieldChanges.join(', ')}. These go live with{' '}
                      {defaultLocaleName}.
                    </Text>
                  )}
                </Flex>
              ))}
            </Flex>
          ))}
        </Flex>
      )}

      {mode === 'publish' && linkedIncomplete && (
        <Note variant="warning">
          Not everything this entry links to could be checked, so some linked content may not be
          listed. Anything missing here stays as it is.
        </Note>
      )}

      {mode === 'publish' && sharedFieldChanges.length > 0 && (
        <Note variant={defaultLocale && allowedLocales.includes(defaultLocale) ? 'neutral' : 'warning'}>
          {sharedFieldChanges.join(', ')} {sharedFieldChanges.length === 1 ? 'has' : 'have'} unpublished
          changes. {sharedFieldChanges.length === 1 ? 'It is' : 'They are'} shared by every region, so{' '}
          {defaultLocale && allowedLocales.includes(defaultLocale)
            ? `${sharedFieldChanges.length === 1 ? 'it' : 'they'} only go${
                sharedFieldChanges.length === 1 ? 'es' : ''
              } live with ${defaultLocaleName}, which is ticked.`
            : `only the owning team or an admin can publish ${
                sharedFieldChanges.length === 1 ? 'it' : 'them'
              } with ${defaultLocaleName}.`}
        </Note>
      )}

      {optionalLocales.length > 0 && (
        <Note variant="neutral">
          Your team owns this entry, so you can also publish{' '}
          {optionalLocales.map(locale => localeNames[locale] ?? locale).join(', ')}. Tick it only
          if those changes need to go live too.
        </Note>
      )}

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
        onClick={() =>
          sdk.close(
            mode === 'publish'
              ? ({ locales: selectedLocales, linkedIds: selectedLinkedIds } satisfies PublishSelection)
              : selectedLocales
          )
        }
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
