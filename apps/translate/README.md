# Translate

A Contentful sidebar app that translates an entry's localized text fields from one locale into
another, using OpenAI. Sits above the Regional Publishing app in the sidebar: translate first,
then publish just your region.

## How it works

- **Config screen**: an admin maps each space Role to a source locale, a target locale, and
  free-text guidance for the model (dialect, tone, terms to avoid — e.g. "avoid Spanglish" for
  `es-US`, "Québécois not Parisian French" for `fr-CA`).
- **Sidebar**: resolves the current user's role, walks every localized `Symbol` / `Text` /
  `RichText` field that exists in both the source and target locale, and overwrites the target
  locale's value with a fresh translation of the source locale's value. Rich text is translated
  node-by-node so marks and structure survive untouched. Always overwrites the target locale —
  there is no merge/skip-if-present behavior.
- **`functions/translate.ts`**: the actual translation call. A Contentful Function (invoked via
  an App Action) that sends the batch of strings to OpenAI (`gpt-4o`) and returns the same-length
  translated array. Runs server-side so the OpenAI key never reaches the browser.

## Local development

```bash
npm install
npm start
```

Then follow Contentful's [app development guide](https://www.contentful.com/developers/docs/extensibility/app-framework/tutorial/#embed-your-app-in-the-contentful-web-app)
to connect the running dev server to a real space/entry.

To iterate on the function locally, see `functions/translate.ts` and the
[Working with Functions](https://www.contentful.com/developers/docs/extensibility/app-framework/working-with-functions/)
docs — `npm run build-functions` compiles it to `build/functions/translate.js`.

## Deploying (functions require a merged bundle)

The frontend (`dist/`) and the function (`build/functions/`) build separately but must be
uploaded as **one** bundle — Contentful validates that the function's `path` from
`contentful-app-manifest.json` exists inside the uploaded directory alongside `index.html`:

```bash
npm run build
npm run build-functions
cp -r build/functions dist/functions
npm run deploy   # or deploy:test
```

If the App Action doesn't exist yet (or the manifest's `actions` array changed), also run:

```bash
npm run upsert-actions
```

## Installation parameters

The App Definition declares two installation parameters (`parameters.installation` — declaring
any schema switches an installation into allowlist-only validation, so both live here even though
only one is secret):

- `openaiApiKey` (`Secret`) — redacted everywhere except inside the Function's
  `context.appInstallationParameters`. Required.
- `roleTranslationMap` (`Symbol`) — a JSON-stringified `Record<roleName, {source, target,
  guidance}>`. Stored as a string because Contentful's installation-parameter types are limited to
  `Boolean | Symbol | Number | Enum | Secret` — there's no nested-object type. The Config screen
  and `src/utils/permissions.ts` handle the stringify/parse at the boundary.

## Manual setup still required (not automated by this app)

1. **Create the App Definition** in the Citizen Watch org (needs a placeholder `src` at creation
   time — Contentful rejects `locations` on a definition with neither `src` nor a bundle — the
   first real bundle upload replaces it).
2. **Wire the sidebar**: for each content type that has at least one localized `Symbol` / `Text` /
   `RichText` field, add this app's widget to the sidebar **above** Regional Publishing's. Content
   types that route their text through referenced sub-entries (common in Citizen's more
   composition-heavy content model) don't need this at all.
3. **CI wiring**: add `translate` to `.github/workflows/deploy-apps.yml`'s `workflow_dispatch`
   options and `APPS` map, and create a `CONTENTFUL_APP_DEF_ID_TRANSLATE` GitHub secret. The
   workflow's deploy job runs `build-functions` and merges `build/functions` into `dist/` for any
   app with a `contentful-app-manifest.json`, so this app's function ships automatically.
4. Provide an OpenAI API key with billing enabled and set it as each installation's
   `openaiApiKey` parameter.
