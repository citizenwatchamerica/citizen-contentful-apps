## Citizen fork

Forked from Contentful's [Deep Clone](https://github.com/contentful/apps/tree/master/apps/deep-clone) app (v1.2.1), which does not clone assets: cloned entries kept linking to the original media, so editing that media on a clone also changed the original. This fork never leaves a clone sharing media with the original:

- Every linked asset (single and multi-asset fields, rich text embedded assets) is duplicated as a new draft asset, titled with the clone text, and the clone links to the copy. An asset shared by several cloned entries is copied once.
- Any asset that can't be duplicated (deleted, no file, processing failure) is removed from the clone instead of staying linked to the original.

When an entry loses an asset link, its `focalPoint` field (Image Focal Point app) is cleared too, since those coordinates belong to the removed image. The sidebar warns how many media links were removed so editors know to add new media before publishing.

---

This project was bootstrapped with [Create Contentful App](https://github.com/contentful/create-contentful-app) and is partially based on [this repository](https://github.com/Your-Majesty/contentful-extension-deep-copy/tree/master) with the following improvements
- using app framework instead of UI Extension
- configuration page
- bug fixes

## Deep Cloning
Contentful's web app clones an entry but none of the referenced entries. This app performs a deep clone of all entries. See "Citizen fork" above for how assets are handled.

## Configuration page
Allows for
- appending text before or after the title field to differentiate between old and new entry
- enables automatic redirect after x number of milliseconds

<img width="747" alt="image" src="https://github.com/PattoCF/deep-clone/assets/59477906/488a21a8-1b4e-43d2-8593-c5ff920a0758">

## Sidebar App
Each content type needs to be configured with the sidebar app. It then shows a button that initiates the cloning process. Depending on config, the page redirects to the newly created top level entry.
