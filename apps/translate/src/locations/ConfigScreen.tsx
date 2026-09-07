import { ConfigAppSDK } from '@contentful/app-sdk';
import {
  Flex,
  Form,
  FormControl,
  Heading,
  Paragraph,
  Select,
  Subheading,
  Textarea,
} from '@contentful/f36-components';
import { useSDK } from '@contentful/react-apps-toolkit';
import { css } from 'emotion';
import { useCallback, useEffect, useState } from 'react';
import { AppInstallationParameters, TranslationConfig, parseRoleTranslationMap } from '../utils/permissions';

interface Role {
  sys: { id: string };
  name: string;
}

// Seeded the first time an admin opens this screen, so the three known regional roles
// start with sensible, locale-appropriate guidance rather than a blank slate. Any of this
// can be edited and saved like any other field - it isn't reapplied once configured.
const DEFAULT_TRANSLATION_CONFIG: Record<string, TranslationConfig> = {
  'Merchants (US)': {
    source: 'en-US',
    target: 'es-US',
    guidance:
      'Translate into neutral U.S. Hispanic/Latin American Spanish for American Spanish-speaking customers. Do not use Spanglish, code-switching, or untranslated English loanwords where a standard Spanish term exists. Avoid Spain-specific (Peninsular) vocabulary and verb forms (e.g. no "vosotros").',
  },
  'Merchants (CA)': {
    source: 'en-CA',
    target: 'fr-CA',
    guidance:
      'Translate into Québécois French (Canadian French) as used in Quebec, Canada — not Parisian/Metropolitan French. Use Quebec French vocabulary, spelling, and idioms (e.g. "magasiner" not "faire du shopping", "courriel" not "e-mail") and avoid anglicisms uncommon in Canadian French.',
  },
  'Merchants (UK)': {
    source: 'en-US',
    target: 'en-GB',
    guidance:
      'Localize into British English spelling, vocabulary, and idiom (e.g. "colour" not "color", "trainers" not "sneakers") while preserving the original meaning and tone.',
  },
  'Author (Global)': {
    source: 'en-US',
    target: 'es-US',
    guidance:
      'Translate into neutral U.S. Hispanic/Latin American Spanish for American Spanish-speaking customers. Do not use Spanglish, code-switching, or untranslated English loanwords where a standard Spanish term exists. Avoid Spain-specific (Peninsular) vocabulary and verb forms (e.g. no "vosotros").',
  },
};

const EMPTY_CONFIG: TranslationConfig = { source: '', target: '', guidance: '' };

const ConfigScreen = () => {
  const sdk = useSDK<ConfigAppSDK>();

  const [roles, setRoles] = useState<Role[] | null>(null);
  const [roleTranslationMap, setRoleTranslationMap] = useState<Record<string, TranslationConfig>>({});

  const spaceLocales = sdk.locales.available;
  const localeNames = sdk.locales.names;

  const onConfigure = useCallback(async () => {
    const currentState = await sdk.app.getCurrentState();
    // roleTranslationMap travels as a JSON string - see permissions.ts for why.
    const parameters: AppInstallationParameters = {
      roleTranslationMap: JSON.stringify(roleTranslationMap),
    };
    return { parameters, targetState: currentState };
  }, [sdk, roleTranslationMap]);

  useEffect(() => {
    sdk.app.onConfigure(() => onConfigure());
  }, [sdk, onConfigure]);

  useEffect(() => {
    (async () => {
      const parameters = (await sdk.app.getParameters()) as AppInstallationParameters | null;
      const savedMap = parseRoleTranslationMap(parameters?.roleTranslationMap);

      const { items } = await sdk.cma.role.getMany({});
      const fetchedRoles = items as Role[];
      setRoles(fetchedRoles);

      const seededMap: Record<string, TranslationConfig> = {};
      for (const role of fetchedRoles) {
        seededMap[role.name] = savedMap[role.name] ?? DEFAULT_TRANSLATION_CONFIG[role.name] ?? EMPTY_CONFIG;
      }
      setRoleTranslationMap(seededMap);

      sdk.app.setReady();
    })();
  }, [sdk]);

  const updateConfig = (roleName: string, patch: Partial<TranslationConfig>) => {
    setRoleTranslationMap(prev => ({
      ...prev,
      [roleName]: { ...(prev[roleName] ?? EMPTY_CONFIG), ...patch },
    }));
  };

  return (
    <Flex flexDirection="column" className={css({ margin: '80px', maxWidth: '800px' })}>
      <Form>
        <Heading>Translate — Configuration</Heading>
        <Paragraph>
          For each role, choose the source locale to translate from and the target locale to
          translate into, plus any guidance the model should follow (dialect, tone, terms to
          avoid). Leave source or target blank to disable translation for that role.
        </Paragraph>

        {roles === null && <Paragraph>Loading roles…</Paragraph>}

        {roles?.map(role => {
          const config = roleTranslationMap[role.name] ?? EMPTY_CONFIG;
          return (
            <FormControl key={role.sys.id} marginBottom="spacingL">
              <Subheading>{role.name}</Subheading>
              <Flex gap="spacingM" marginBottom="spacingS">
                <FormControl id={`${role.sys.id}-source`}>
                  <FormControl.Label>Source locale</FormControl.Label>
                  <Select
                    value={config.source}
                    onChange={e => updateConfig(role.name, { source: e.target.value })}
                  >
                    <Select.Option value="">Not configured</Select.Option>
                    {spaceLocales.map(locale => (
                      <Select.Option key={locale} value={locale}>
                        {localeNames[locale] ?? locale}
                      </Select.Option>
                    ))}
                  </Select>
                </FormControl>
                <FormControl id={`${role.sys.id}-target`}>
                  <FormControl.Label>Target locale</FormControl.Label>
                  <Select
                    value={config.target}
                    onChange={e => updateConfig(role.name, { target: e.target.value })}
                  >
                    <Select.Option value="">Not configured</Select.Option>
                    {spaceLocales.map(locale => (
                      <Select.Option key={locale} value={locale}>
                        {localeNames[locale] ?? locale}
                      </Select.Option>
                    ))}
                  </Select>
                </FormControl>
              </Flex>
              <FormControl id={`${role.sys.id}-guidance`}>
                <FormControl.Label>Guidance for the translator</FormControl.Label>
                <Textarea
                  rows={3}
                  value={config.guidance}
                  onChange={e => updateConfig(role.name, { guidance: e.target.value })}
                  placeholder="e.g. dialect to use, terms to avoid, tone"
                />
              </FormControl>
            </FormControl>
          );
        })}
      </Form>
    </Flex>
  );
};

export default ConfigScreen;
