export interface TranslationConfig {
  source: string;
  target: string;
  guidance: string;
}

export type RoleTranslationMap = Record<string, TranslationConfig>;

// The App Definition declares `roleTranslationMap` as a plain Symbol (string) installation
// parameter - Contentful's installation-parameter schema only supports
// Boolean/Symbol/Number/Enum/Secret (no nested object type), and declaring any schema at
// all switches installations into allowlist-only validation. So the map travels as a JSON
// string rather than a nested object.
export interface AppInstallationParameters {
  roleTranslationMap?: string;
}

export const parseRoleTranslationMap = (raw: string | undefined): RoleTranslationMap => {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as RoleTranslationMap;
  } catch {
    return {};
  }
};

export interface SpaceMembership {
  admin: boolean;
  roles: Array<{ name: string }>;
}

// Unlike Regional Publishing, admins don't get an implicit "everything" here - a
// translation direction (source -> target) is inherently role/region specific, so an
// admin with no matching role config simply isn't configured for translation either.
export const getTranslationConfig = (
  spaceMembership: SpaceMembership,
  parameters: AppInstallationParameters | null
): TranslationConfig | null => {
  const roleTranslationMap = parseRoleTranslationMap(parameters?.roleTranslationMap);

  for (const role of spaceMembership.roles) {
    const config = roleTranslationMap[role.name];
    if (config?.source && config?.target) {
      return config;
    }
  }

  return null;
};
