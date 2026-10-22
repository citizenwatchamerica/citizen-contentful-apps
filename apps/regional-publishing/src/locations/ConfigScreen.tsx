import { ConfigAppSDK } from '@contentful/app-sdk';
import {
  Checkbox,
  Flex,
  Form,
  FormControl,
  Heading,
  Note,
  Paragraph,
  Subheading,
  Text,
} from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { css } from 'emotion';
import { useCallback, useEffect, useState } from 'react';
import { AppInstallationParameters } from '../utils/permissions';

interface Role {
  sys: { id: string };
  name: string;
}

const ConfigScreen = () => {
  const sdk = useSDK<ConfigAppSDK>();

  const [roles, setRoles] = useState<Role[] | null>(null);
  const [roleLocaleMap, setRoleLocaleMap] = useState<Record<string, string[]>>({});
  // Maintained by scripts/sync-role-members.mjs; only carried through here so saving keeps it.
  const [roleMembers, setRoleMembers] = useState<Record<string, string[]>>({});

  const spaceLocales = sdk.locales.available;

  const onConfigure = useCallback(async () => {
    const currentState = await sdk.app.getCurrentState();
    const parameters: AppInstallationParameters = { roleLocaleMap, roleMembers };
    return { parameters, targetState: currentState };
  }, [sdk, roleLocaleMap, roleMembers]);

  useEffect(() => {
    sdk.app.onConfigure(() => onConfigure());
  }, [sdk, onConfigure]);

  useEffect(() => {
    (async () => {
      const parameters = (await sdk.app.getParameters()) as AppInstallationParameters | null;
      setRoleLocaleMap(parameters?.roleLocaleMap ?? {});
      setRoleMembers(parameters?.roleMembers ?? {});

      const { items } = await sdk.cma.role.getMany({});
      setRoles(items as Role[]);

      sdk.app.setReady();
    })();
  }, [sdk]);

  // Keyed by role *name*: sdk.user.spaceMembership.roles (used at publish time in the
  // Sidebar) only exposes name/description, never role ids.
  const toggleLocale = (roleName: string, locale: string, checked: boolean) => {
    setRoleLocaleMap(prev => {
      const current = prev[roleName] ?? [];
      const next = checked ? [...current, locale] : current.filter(l => l !== locale);
      return { ...prev, [roleName]: next };
    });
  };

  return (
    <Flex flexDirection="column" className={css({ margin: '80px', maxWidth: '800px' })}>
      <Form>
        <Heading>Regional Publishing — Configuration</Heading>
        <Paragraph>
          Choose which locales each role is allowed to publish. Space admins can always publish
          every locale, regardless of this configuration.
        </Paragraph>
        <Note variant="neutral">
          A team can also publish the default locale of entries a teammate created. Who holds each
          role is recorded by the app&apos;s sync-role-members script, not on this screen - re-run
          it whenever someone joins or leaves a team.
        </Note>

        {roles === null && <Paragraph>Loading roles…</Paragraph>}

        {roles?.map(role => (
          <FormControl key={role.sys.id}>
            <Subheading>{role.name}</Subheading>
            <Text fontSize="fontSizeS" fontColor="gray500">
              {(roleMembers[role.name] ?? []).length} members recorded
            </Text>
            <Flex gap="spacingM" flexWrap="wrap">
              {spaceLocales.map(locale => (
                <Checkbox
                  key={locale}
                  id={`${role.sys.id}-${locale}`}
                  isChecked={(roleLocaleMap[role.name] ?? []).includes(locale)}
                  onChange={e =>
                    toggleLocale(role.name, locale, (e.target as HTMLInputElement).checked)
                  }
                >
                  {locale}
                </Checkbox>
              ))}
            </Flex>
          </FormControl>
        ))}
      </Form>
    </Flex>
  );
};

export default ConfigScreen;
