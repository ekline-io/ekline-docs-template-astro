---
title: How it works
description: Three access levels, one round trip through your own product's sign-in — this site has no user database of its own.
---

Three levels, from what a reader needs to see a page:

| Level | Who can see it | Where it lives |
| --- | --- | --- |
| Public docs | Anyone | `src/content/docs/` |
| Private docs | Any signed-in reader | `src/content/private-docs/` |
| Org docs | Signed-in readers whose session lists that org | `src/content/org-docs/<org>/` |

Private and org content is never part of the static build — it renders on
request, behind server middleware, so it can't leak into search, `llms.txt`,
the sitemap, or a page's Markdown twin by omission.

## Readers sign in through your product, not this one

There's no login form, no password field and no user database here. A
reader who opens a private link is redirected to a URL your own product
exposes; your product decides who they are, signs a short-lived token
saying so, and hands them back. This site only ever checks that token — it
never collects credentials itself.

That's the whole model. [Setting it up](/sso-setup/) covers the token and
the one endpoint you implement.

:::note
This page and the two after it are the contract. The exact request signals
the guard checks, why a wrong org answers 404 and not 403, and every
measured bypass that's been closed along the way live in [Private and
per-org docs](/internals/private-docs/) — written for whoever maintains
this template's internals, not required reading to use it.
:::
