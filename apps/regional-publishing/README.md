# Regional Publishing

A Contentful sidebar app that replaces the native Publish button with one that only publishes
the locales a user's role is allowed to publish. It relies on Contentful's Enterprise
**locale-based publishing** (`add.fields` on the entry `published` endpoint), which leaves every
other locale's already-published content untouched — so one team publishing their locale can
never accidentally ship another team's in-progress edits in a different locale.

## How it works

- **Config screen**: an admin maps each space Role to the locales that role may publish.
- **Sidebar**: resolves the current user's role(s) (space Admins always get every locale), shows
  which locales will be published, and publishes only those. An **Unpublish** button does the
  reverse through `remove.fields` on the same endpoint: it offers only the user's currently
  published locales and takes down just the ones they pick. Unpublishing every locale that's
  still live leaves the entry fully unpublished, same as the native button.
- **Team-owned entries**: an entry belongs to a regional team when it was created by the editor
  or by a teammate on the same role (checked against `roleMembers`, see below), and no other
  team's content links to it in a locale the team doesn't own. A UK slide placed in a US slider's
  en-GB field still counts as the UK team's; one in the slider's en-US field doesn't. Links are
  followed upwards through teammates' entries, and anything that can't be fully checked counts
  as shared. The entry's name is never used.
- **First publish**: Contentful requires an entry's first publish to include the default locale,
  so it's locked on in the dialog for that publish. A regional team gets it for entries it owns,
  even though its role doesn't otherwise cover the default locale. Otherwise the sidebar explains
  that an admin or the owning team has to publish it first, instead of letting it fail.
- **Later publishes**: on a team-owned entry the default locale is offered unticked, so the team
  publishes just its own locales unless it opts in.
- **Linked content**: the publish dialog lists every draft or changed entry and asset this entry
  references, directly or through other linked entries, grouped by the reference field it comes
  through. Each one starts ticked and can be unticked. Only links that show in the ticked regions
  count, following locale fallbacks, so a slide in a slider's en-US field isn't offered to the UK
  team. Ticked items are published first, deepest first, in the same locales as the entry. A
  never-published item gets the default locale under the same ownership rule as the entry itself.
  An item that can't be published is listed after the publish and doesn't stop the entry going
  out.
- **Shared-field changes**: non-localized fields (slug, size, focal point...) live under the
  default locale, so publishing a region alone never sends them. The app diffs each entry's draft
  against its published copy. When shared fields changed, a linked item is offered even if it's
  up to date in the region, with the field names shown, and is published with the default locale
  added. On the entry itself, the optional default locale starts ticked, with a note naming the
  fields. The same ownership rule applies; anything the user can't publish is reported instead. The walk stops at 100 items or 6 levels deep, and the dialog says when the list may be
  incomplete.
- **Shared content types**: a content type with no localized fields keeps everything under the
  default locale, so any regional editor publishes it with the default locale on every publish,
  whoever created the entry.

## Local development

```bash
npm install
npm start
```

Then follow Contentful's [app development guide](https://www.contentful.com/developers/docs/extensibility/app-framework/tutorial/#embed-your-app-in-the-contentful-web-app)
to connect the running dev server to a real space/entry.

## Role members

The sidebar needs to know which role an entry's creator holds, but non-admins can't read other
users' memberships and the App SDK's CMA client doesn't expose them. A space admin records them
in the installation's `roleMembers` parameter instead (team-based access included):

```bash
npm run sync-role-members -- --space <space id>          # dry run
npm run sync-role-members -- --space <space id> --apply  # save
```

It uses `CONTENTFUL_MANAGEMENT_TOKEN`, or the token from `contentful login`. Re-run it whenever
someone joins or leaves a team. Until then, a newcomer's entries only count as team-owned when
they publish them themselves. Saving the config screen keeps the recorded list.

## Manual setup still required (not automated by this app)

1. **Create the App Definition** in the Citizen Watch org and install it into the target spaces'
   environments — either via `npm run create-app-definition` or the Contentful UI. Do **not** run
   the repo-root `scripts/setup.ts`; it provisions brand-new dedicated spaces per app, which
   doesn't fit installing into the existing Bulova/Citizen spaces.
2. **Swap the sidebar widget**: for each content type where this should apply, an org admin needs
   to open the content type's sidebar customization and replace the native "Publish" widget with
   this app — the app can't hide the native button on its own.
3. **CI wiring**: once an App Definition ID exists, add `regional-publishing` to
   `.github/workflows/deploy-apps.yml`'s `workflow_dispatch` options and `APPS` map, and create a
   `CONTENTFUL_APP_DEF_ID_REGIONAL_PUBLISHING` GitHub secret.
4. Confirm **locale-based publishing** is actually enabled for each target space — it's an
   Enterprise-tier, currently opt-in feature.
