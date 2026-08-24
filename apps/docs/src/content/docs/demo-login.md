---
title: Trying it without SSO
description: DOCS_UNSAFE_DEMO_LOGIN turns /demo-login into a sign-in that accepts anyone. Read this before you set it.
---

```
DOCS_UNSAFE_DEMO_LOGIN=1
DOCS_SSO_URL=https://<your-deployment>/demo-login
```

— plus the two secrets from [Setting it up](/sso-setup/) — turns
`/demo-login` into a persona picker that signs the same handoff token your
product would. Three fake readers ship with it, one per example org plus
one with none, so org isolation is visible in two clicks with nothing real
behind it.

:::caution
**The name is the warning: this sign-in accepts anyone.** Set it only on a
demo or staging deployment that holds no real private content, and unset it
the moment your real `DOCS_SSO_URL` exists. On a site with real private
content, this flag makes that content readable by anyone who finds
`/demo-login` — not only by clicking through the picker.
:::

Use it for:

- The template's own live preview.
- A staging site where you're evaluating private docs before your real SSO
  endpoint is built.

Don't use it anywhere holding content you wouldn't want public.

## If your org folders differ from the examples

The three personas sign `orgs` values that must match real folder names
under `src/content/org-docs/` exactly — the same contract a real token is
under (see [Writing private and per-org content](/private-content/)). Edit
the list in `src/lib/demo-login.mjs` if your staging site's org folders
don't match `acme` and `globex`.

Exactly what this flag does and doesn't defend against — and how someone
without SSO access could still reach it — is in [Private and per-org
docs](/internals/private-docs/).
