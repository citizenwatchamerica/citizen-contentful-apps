export interface AppInstallationParameters {
  // Keyed by role *name*: the App SDK only exposes name/description for the
  // current user's roles (sdk.user.spaceMembership.roles), not role ids.
  roleLocaleMap: Record<string, string[]>;
  // Role name -> ids of every user holding it, directly or through a team. Neither non-admins nor
  // the App SDK's CMA client can read other users' memberships, so scripts/sync-role-members.mjs
  // snapshots them here for the sidebar to check who an entry's creator is.
  roleMembers?: Record<string, string[]>;
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

// The publishing roles the current user shares with an entry's creator - i.e. the team(s) that
// own the entry. Having created it yourself always counts; a colleague counts only when
// `roleMembers` lists them under the same role.
export const getOwningRoles = (
  spaceMembership: SpaceMembership,
  parameters: AppInstallationParameters | null,
  creatorId: string | undefined,
  currentUserId: string
): string[] => {
  if (!creatorId) return [];

  const roleLocaleMap = parameters?.roleLocaleMap ?? {};
  const roleMembers = parameters?.roleMembers ?? {};

  return spaceMembership.roles
    .map(role => role.name)
    .filter(roleName => (roleLocaleMap[roleName] ?? []).length > 0)
    .filter(
      roleName => creatorId === currentUserId || (roleMembers[roleName] ?? []).includes(creatorId)
    );
};
