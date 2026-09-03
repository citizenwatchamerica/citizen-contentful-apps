# Regional Publishing

A Contentful sidebar app that replaces the native Publish button with one that only publishes
the locales a user's role is allowed to publish. It relies on Contentful's Enterprise
**locale-based publishing** (`add.fields` on the entry `published` endpoint), which leaves every
other locale's already-published content untouched — so one team publishing their locale can
never accidentally ship another team's in-progress edits in a different locale.

## How it works

- **Config screen**: an admin maps each space Role to the locales that role may publish.
- **Sidebar**: resolves the current user's role(s) (space Admins always get every locale), shows
  which locales will be published, and publishes only those.

## Local development

```bash
npm install
npm start
```

Then follow Contentful's [app development guide](https://www.contentful.com/developers/docs/extensibility/app-framework/tutorial/#embed-your-app-in-the-contentful-web-app)
to connect the running dev server to a real space/entry.

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
