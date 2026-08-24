---
title: Removing what you don't need
description: File by file — what to delete to drop the API reference, the logged-in experience, or both — and how to get a plain static build back.
---

Both features are optional, and the template is built to come apart
cleanly. Deleting the logged-in tier is also what unlocks fully static
hosting — see [Deploy](/deploy/).

## Remove the API reference

| Delete | |
| --- | --- |
| `public/openapi.yaml`, `public/openapi-admin.yaml` | The two example documents. |
| `src/pages/api/` | The route. |
| `src/config/api-reference.mjs` | The reference list. |
| `src/lib/openapi-sidebar.mjs` | The generated sidebar group. |
| `src/components/ScalarApiReference.astro`, `src/components/ApiSearchIndex.astro` | The Scalar wrapper and its search bridge. |
| `tests/openapi-sidebar.test.mjs`, `tests/scalar-api-reference.test.mjs`, `tests/visual/api-reference.spec.mjs` | Their tests. |

Then, in `astro.config.mjs`: remove the `apiReferenceSidebar` block, its
imports from `src/config/api-reference.mjs` and `src/lib/openapi-sidebar.mjs`,
and its spread into the `sidebar:` array.

Uninstall the Scalar dependencies and the `overrides` entry pinning one of
them to this project's Astro version:

```bash
npm uninstall @scalar/astro @scalar/openapi-parser @scalar/workspace-store
```

## Remove the logged-in experience

| Delete | |
| --- | --- |
| `src/content/private-docs/`, `src/content/org-docs/` | The two collections' content. |
| `src/pages/private/`, `src/pages/auth/`, `src/pages/demo-login.astro` | The guarded routes and the demo login. |
| `src/middleware.ts` | The guard. |
| `src/config/auth.mjs`, `src/config/demo-login.mjs` | Auth and demo-login configuration. |
| `src/lib/auth/`, `src/lib/demo-login.mjs`, `src/lib/private-sidebar.mjs`, `src/lib/sidebar-items.mjs` | Supporting logic. |
| `src/components/AuthControl.astro` | The Log in / Log out control. |
| `tests/auth-*.test.mjs`, `tests/demo-login.test.mjs`, `tests/private-leaks.test.mjs`, `tests/sidebar-items.test.mjs`, `tests/visual/auth.spec.mjs`, `tests/visual/demo-login.spec.mjs`, `tests/mock-sso/` | Their tests, and the mock SSO server. |

Then:

1. Drop the `privateDocs` and `orgDocs` collections from `src/content.config.ts`.
2. Drop `privateDocsLink` from `src/config/sidebar.mjs`, and its conditional
   use in `astro.config.mjs`.
3. Remove the `AuthControl` import and its render from
   `src/components/CustomHeader.astro` and
   `src/components/CustomMobileMenuFooter.astro`. If that leaves the latter
   doing nothing else, delete it and its `MobileMenuFooter` override in
   `astro.config.mjs` too.
4. Remove the hint-cookie import and inline script from
   `src/components/CustomHead.astro`.
5. Remove the `dev:sso` script from `package.json` and the mock-SSO
   `webServer` entry from `playwright.config.mjs`.

Then get the plain static build back, or the site keeps shipping a server
it no longer needs:

1. In `astro.config.mjs`, remove the `adapter:` line, the `env:` block, the
   two adapter imports, and the sitemap `filter`.
2. Uninstall the adapters and the token library:

   ```bash
   npm uninstall @astrojs/node @astrojs/vercel jose
   ```

Skipping that second half leaves `dist/server/` in the build output with no
`dist/index.html` at the root — which quietly breaks static-host deploy
instructions that expect one.

## Removing both

`npm run test:visual` and `playwright.config.mjs` have nothing left to test
once both features are gone — their only two subjects are the API
reference and the SSO round trip. Delete `playwright.config.mjs`, the
`test:visual*` scripts, and the `@playwright/test` dependency too.

Full removal instructions, in the template's own words, are in its
[README, under *Don't need private
docs?*](https://github.com/ekline-io/ekline-docs-template-astro/blob/main/packages/template/README.md#dont-need-private-docs).
