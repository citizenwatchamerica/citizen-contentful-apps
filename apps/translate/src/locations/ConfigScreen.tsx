import { ConfigAppSDK } from '@contentful/app-sdk';
import {
  Button,
  Flex,
  Form,
  FormControl,
  Heading,
  IconButton,
  Paragraph,
  Select,
  Subheading,
  Textarea,
} from '@contentful/f36-components';
import { DeleteIcon, PlusIcon } from '@contentful/f36-icons';
import { useSDK } from '@contentful/react-apps-toolkit';
import { css } from 'emotion';
import { useCallback, useEffect, useState } from 'react';
import { AppInstallationParameters, TranslationConfig, parseRoleTranslationMap } from '../utils/permissions';

interface Role {
  sys: { id: string };
  name: string;
}

// Seeded the first time an admin opens this screen, so the known regional roles start with
// sensible, locale-appropriate guidance and directions rather than a blank slate. Any of this
// can be edited, added to, or removed - it isn't reapplied once a role has been saved.
const DEFAULT_TRANSLATION_CONFIG: Record<string, TranslationConfig[]> = {
  'Merchants (US)': [
    {
      source: 'en-US',
      target: 'es-US',
      guidance:
        'Translate into neutral U.S. Hispanic/Latin American Spanish for American Spanish-speaking customers. Do not use Spanglish, code-switching, or untranslated English loanwords where a standard Spanish term exists. Avoid Spain-specific (Peninsular) vocabulary and verb forms (e.g. no "vosotros").',
    },
  ],
  'Merchants (CA)': [
    {
      source: 'en-CA',
      target: 'fr-CA',
      guidance:
        'Translate into Québécois French (Canadian French) as used in Quebec, Canada — not Parisian/Metropolitan French. Use Quebec French vocabulary, spelling, and idioms (e.g. "magasiner" not "faire du shopping", "courriel" not "e-mail") and avoid anglicisms uncommon in Canadian French.',
    },
    {
      source: 'en-US',
      target: 'en-CA',
      guidance:
        'Localize into Canadian English spelling, vocabulary, and idiom (e.g. "colour" not "color", "centre" not "center", "toque" not "beanie") while preserving the original meaning and tone. Prefer metric units where relevant.',
    },
  ],
  'Merchants (UK)': [
    {
      source: 'en-US',
      target: 'en-GB',
      guidance:
        'Localize into British English spelling, vocabulary, and idiom (e.g. "colour" not "color", "trainers" not "sneakers") while preserving the original meaning and tone.',
    },
  ],
  'Author (Global)': [
    {
      source: 'en-US',
      target: 'es-US',
      guidance:
        'Translate into neutral U.S. Hispanic/Latin American Spanish for American Spanish-speaking customers. Do not use Spanglish, code-switching, or untranslated English loanwords where a standard Spanish term exists. Avoid Spain-specific (Peninsular) vocabulary and verb forms (e.g. no "vosotros").',
    },
  ],
};

const EMPTY_CONFIG: TranslationConfig = { source: '', target: '', guidance: '' };

const ConfigScreen = () => {
  const sdk = useSDK<ConfigAppSDK>();

  const [roles, setRoles] = useState<Role[] | null>(null);
  const [roleTranslationMap, setRoleTranslationMap] = useState<Record<string, TranslationConfig[]>>({});

  const spaceLocales = sdk.locales.available;
  const localeNames = sdk.locales.names;

  const onConfigure = useCallback(async () => {
    const currentState = await sdk.app.getCurrentState();
    // Drop blank/incomplete rows before saving - only persist rules that actually have both
    // a source and a target. roleTranslationMap travels as a JSON string - see permissions.ts.
    const cleaned: Record<string, TranslationConfig[]> = {};
    for (const [roleName, configs] of Object.entries(roleTranslationMap)) {
      const valid = configs.filter(c => c.source && c.target);
      if (valid.length > 0) cleaned[roleName] = valid;
    }
    const parameters: AppInstallationParameters = { roleTranslationMap: JSON.stringify(cleaned) };
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

      const seededMap: Record<string, TranslationConfig[]> = {};
      for (const role of fetchedRoles) {
        const saved = savedMap[role.name];
        seededMap[role.name] = saved?.length ? saved : (DEFAULT_TRANSLATION_CONFIG[role.name] ?? []);
      }
      setRoleTranslationMap(seededMap);

      sdk.app.setReady();
    })();
  }, [sdk]);

  const updateRule = (roleName: string, index: number, patch: Partial<TranslationConfig>) => {
    setRoleTranslationMap(prev => {
      const configs = [...(prev[roleName] ?? [])];
      configs[index] = { ...(configs[index] ?? EMPTY_CONFIG), ...patch };
      return { ...prev, [roleName]: configs };
    });
  };

  const addRule = (roleName: string) => {
    setRoleTranslationMap(prev => ({
      ...prev,
      [roleName]: [...(prev[roleName] ?? []), { ...EMPTY_CONFIG }],
    }));
  };

  const removeRule = (roleName: string, index: number) => {
    setRoleTranslationMap(prev => ({
      ...prev,
      [roleName]: (prev[roleName] ?? []).filter((_, i) => i !== index),
    }));
  };

  return (
    <Flex flexDirection="column" className={css({ margin: '80px', maxWidth: '800px' })}>
      <Form>
        <Heading>Translate — Configuration</Heading>
        <Paragraph>
          For each role, choose one or more translation directions: a source locale, a target
          locale, and any guidance the model should follow (dialect, tone, terms to avoid). A role
          with no rules won't see the Translate button. Roles with more than one rule get a picker
          in the sidebar to choose which direction to run.
        </Paragraph>

        {roles === null && <Paragraph>Loading roles…</Paragraph>}

        {roles?.map(role => {
          const configs = roleTranslationMap[role.name] ?? [];
          return (
            <FormControl key={role.sys.id} marginBottom="spacingL">
              <Subheading>{role.name}</Subheading>

              {configs.length === 0 && <Paragraph>No translation rules configured.</Paragraph>}

              {configs.map((config, index) => (
                <Flex
                  key={index}
                  flexDirection="column"
                  gap="spacingXs"
                  marginBottom="spacingM"
                  padding="spacingS"
                  className={css({ border: '1px solid #d3dce0', borderRadius: '6px' })}
                >
                  <Flex gap="spacingM" alignItems="flex-end">
                    <FormControl id={`${role.sys.id}-${index}-source`} marginBottom="none">
                      <FormControl.Label>Source locale</FormControl.Label>
                      <Select
                        value={config.source}
                        onChange={e => updateRule(role.name, index, { source: e.target.value })}
                      >
                        <Select.Option value="">Not configured</Select.Option>
                        {spaceLocales.map(locale => (
                          <Select.Option key={locale} value={locale}>
                            {localeNames[locale] ?? locale}
                          </Select.Option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl id={`${role.sys.id}-${index}-target`} marginBottom="none">
                      <FormControl.Label>Target locale</FormControl.Label>
                      <Select
                        value={config.target}
                        onChange={e => updateRule(role.name, index, { target: e.target.value })}
                      >
                        <Select.Option value="">Not configured</Select.Option>
                        {spaceLocales.map(locale => (
                          <Select.Option key={locale} value={locale}>
                            {localeNames[locale] ?? locale}
                          </Select.Option>
                        ))}
                      </Select>
                    </FormControl>
                    <IconButton
                      variant="transparent"
                      icon={<DeleteIcon />}
                      aria-label="Remove this rule"
                      onClick={() => removeRule(role.name, index)}
                    />
                  </Flex>
                  <FormControl id={`${role.sys.id}-${index}-guidance`} marginBottom="none">
                    <FormControl.Label>Guidance for the translator</FormControl.Label>
                    <Textarea
                      rows={3}
                      value={config.guidance}
                      onChange={e => updateRule(role.name, index, { guidance: e.target.value })}
                      placeholder="e.g. dialect to use, terms to avoid, tone"
                    />
                  </FormControl>
                </Flex>
              ))}

              <Button
                variant="secondary"
                size="small"
                startIcon={<PlusIcon />}
                onClick={() => addRule(role.name)}
              >
                Add another rule
              </Button>
            </FormControl>
          );
        })}
      </Form>
    </Flex>
  );
};

export default ConfigScreen;
