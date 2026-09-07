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

const ADMIN_FALLBACK_ROLE = 'Author (Global)';

// Unlike Regional Publishing, there's no single "everything" translation direction, so an
// admin doesn't get every locale the way they get every publish target. But Contentful
// reports an empty `roles` array for space admins regardless of any role also assigned to
// them, so without a fallback they'd always show as unconfigured even when a sensible
// default (Author (Global)'s pair) exists. Fall back to that role's config for admins only.
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

  if (spaceMembership.admin) {
    const fallback = roleTranslationMap[ADMIN_FALLBACK_ROLE];
    if (fallback?.source && fallback?.target) {
      return fallback;
    }
  }

  return null;
};
