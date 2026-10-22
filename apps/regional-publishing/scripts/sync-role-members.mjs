#!/usr/bin/env node
// Records who holds each role in the Regional Publishing installation's `roleMembers` parameter,
// so the sidebar can tell whether an entry's creator is on the editor's team. The app can't
// gather this itself: non-admins can't read other users' memberships, and the App SDK's CMA
// client doesn't expose space members at all. Space members (unlike space memberships) carry
// each user's effective roles, including ones granted through a team.
//
// Usage (needs a space admin's CMA token, from CONTENTFUL_MANAGEMENT_TOKEN or ~/.contentfulrc.json):
//   node scripts/sync-role-members.mjs --space <space id> [--environment master] [--apply]
// Dry run by default: prints each role's member count and whether anything changed.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP_DEFINITION_ID = '2Zt0lpDnbPC0kYoUTLGrFU';
const PAGE_SIZE = 100;

const argumentValue = name => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

const spaceId = argumentValue('space');
const environmentId = argumentValue('environment') ?? 'master';
const apply = process.argv.includes('--apply');

if (!spaceId) {
  console.error('Usage: node scripts/sync-role-members.mjs --space <space id> [--environment master] [--apply]');
  process.exit(1);
}

const readToken = () => {
  if (process.env.CONTENTFUL_MANAGEMENT_TOKEN) return process.env.CONTENTFUL_MANAGEMENT_TOKEN;
  try {
    return JSON.parse(readFileSync(join(homedir(), '.contentfulrc.json'), 'utf8')).managementToken;
  } catch {
    return undefined;
  }
};

const token = readToken();
if (!token) {
  console.error('Set CONTENTFUL_MANAGEMENT_TOKEN or log in with `contentful login` first.');
  process.exit(1);
}

const request = async (path, options = {}) => {
  const response = await fetch(`https://api.contentful.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.contentful.management.v1+json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
};

const getAll = async path => {
  const items = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await request(`${path}?limit=${PAGE_SIZE}&skip=${skip}`);
    items.push(...page.items);
    if (page.items.length === 0 || items.length >= page.total) return items;
  }
};

const roles = await getAll(`/spaces/${spaceId}/roles`);
const roleNames = new Map(roles.map(role => [role.sys.id, role.name]));

const roleMembers = {};
for (const member of await getAll(`/spaces/${spaceId}/space_members`)) {
  for (const role of member.roles) {
    const roleName = roleNames.get(role.sys.id);
    if (!roleName) continue;
    roleMembers[roleName] = [...(roleMembers[roleName] ?? []), member.sys.user.sys.id].sort();
  }
}

const installationPath = `/spaces/${spaceId}/environments/${environmentId}/app_installations/${APP_DEFINITION_ID}`;
const installation = await request(installationPath);
const { roleMembers: previousRoleMembers = {}, ...otherParameters } = installation.parameters ?? {};

for (const roleName of [...roleNames.values()].sort()) {
  const before = previousRoleMembers[roleName]?.length ?? 0;
  const after = roleMembers[roleName]?.length ?? 0;
  console.log(`${roleName}: ${after} member(s)${before === after ? '' : ` (was ${before})`}`);
}

if (JSON.stringify(previousRoleMembers) === JSON.stringify(roleMembers)) {
  console.log('\nNo changes.');
} else if (!apply) {
  console.log('\nDry run - re-run with --apply to save.');
} else {
  // This app has no Secret parameters, so re-sending the rest as-is is safe.
  await request(installationPath, {
    method: 'PUT',
    body: JSON.stringify({ parameters: { ...otherParameters, roleMembers } }),
  });
  console.log('\nSaved roleMembers.');
}
