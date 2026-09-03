export interface AppInstallationParameters {
  // Keyed by role *name*: the App SDK only exposes name/description for the
  // current user's roles (sdk.user.spaceMembership.roles), not role ids.
  roleLocaleMap: Record<string, string[]>;
}

export interface SpaceMembership {
  admin: boolean;
  roles: Array<{ name: string }>;
}

export const getAllowedLocales = (
  spaceMembership: SpaceMembership,
  parameters: AppInstallationParameters | null,
  spaceLocales: string[]
): string[] => {
  if (spaceMembership.admin) {
    return spaceLocales;
  }

  const roleLocaleMap = parameters?.roleLocaleMap ?? {};
  const allowed = new Set<string>();

  for (const role of spaceMembership.roles) {
    for (const locale of roleLocaleMap[role.name] ?? []) {
      allowed.add(locale);
    }
  }

  return spaceLocales.filter(locale => allowed.has(locale));
};
