export interface TranslationConfig {
  source: string;
  target: string;
  guidance: string;
}

export type RoleTranslationMap = Record<string, TranslationConfig[]>;

// The App Definition declares `roleTranslationMap` as a plain Symbol (string) installation
// parameter - Contentful's installation-parameter schema only supports
// Boolean/Symbol/Number/Enum/Secret (no nested object/array type), and declaring any schema at
// all switches installations into allowlist-only validation. So the map travels as a JSON
// string rather than a nested object.
export interface AppInstallationParameters {
  openaiApiKey?: string;
  roleTranslationMap?: string;
  // Newline-separated names the translator must leave exactly as written (brands, collections,
  // collaborations). Shared by every role and locale pair.
  protectedTerms?: string;
}

export const parseProtectedTerms = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(/\r?\n|,/)
    .map(term => term.trim())
    .filter(Boolean);

const isValidConfig = (value: unknown): value is TranslationConfig => {
  const config = value as TranslationConfig | undefined;
  return !!config?.source && !!config?.target;
};

// A role's stored value may be a single config object (the original shape, one rule per role)
// or an array of them (added to support a role needing more than one direction, e.g. Canada
// needing both en-CA -> fr-CA and en-US -> en-CA) - normalize both shapes to an array here so
// callers never have to care which one was actually stored.
export const parseRoleTranslationMap = (raw: string | undefined): RoleTranslationMap => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, TranslationConfig | TranslationConfig[]>;
    const normalized: RoleTranslationMap = {};
    for (const [role, value] of Object.entries(parsed)) {
      normalized[role] = (Array.isArray(value) ? value : [value]).filter(isValidConfig);
    }
    return normalized;
  } catch {
    return {};
  }
};

export interface SpaceMembership {
  admin: boolean;
  roles: Array<{ name: string }>;
}

const ADMIN_FALLBACK_ROLE = 'Author (Global)';

// Returns every translation rule configured for the current user's role(s) - the first role
// (in the order the platform lists them) that has at least one valid rule wins. Contentful
// reports space admins with an empty `roles` array regardless of any role also assigned to
// them, so without a fallback they'd always show as unconfigured; admins fall back to
// Author (Global)'s rules specifically, same as Regional Publishing gives admins every locale.
export const getTranslationConfigs = (
  spaceMembership: SpaceMembership,
  parameters: AppInstallationParameters | null
): TranslationConfig[] => {
  const roleTranslationMap = parseRoleTranslationMap(parameters?.roleTranslationMap);

  for (const role of spaceMembership.roles) {
    const configs = roleTranslationMap[role.name];
    if (configs?.length) {
      return configs;
    }
  }

  if (spaceMembership.admin) {
    const fallback = roleTranslationMap[ADMIN_FALLBACK_ROLE];
    if (fallback?.length) {
      return fallback;
    }
  }

  return [];
};

export interface LabelledTranslationConfig extends TranslationConfig {
  roles: string[];
}

// Bulk translation is admin-only, and admins can run any direction an admin has configured for
// any role (rather than only Author (Global)'s fallback). Identical rules shared by several roles
// are listed once, naming every role that has them.
export const getAllTranslationConfigs = (
  parameters: AppInstallationParameters | null
): LabelledTranslationConfig[] => {
  const roleTranslationMap = parseRoleTranslationMap(parameters?.roleTranslationMap);
  const byRule = new Map<string, LabelledTranslationConfig>();

  for (const [roleName, configs] of Object.entries(roleTranslationMap)) {
    for (const config of configs) {
      const key = JSON.stringify([config.source, config.target, config.guidance ?? '']);
      const existing = byRule.get(key);
      if (existing) {
        existing.roles.push(roleName);
      } else {
        byRule.set(key, { ...config, roles: [roleName] });
      }
    }
  }

  return [...byRule.values()];
};
