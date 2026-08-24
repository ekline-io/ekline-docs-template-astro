---
title: Writing private and per-org content
description: Two collections, one folder-naming rule, and why sidebar.hidden isn't access control.
---

Two collections, same frontmatter as public docs:

| Collection | Folder | Visible to | URL |
| --- | --- | --- | --- |
| Private docs | `src/content/private-docs/` | Any signed-in reader | `/private/…` |
| Org docs | `src/content/org-docs/<org>/` | Readers whose session lists `<org>` | `/private/orgs/<org>/…` |

Write pages the same way as anything under `src/content/docs/` — same
`title` / `description` frontmatter, same Markdown or MDX, same sidebar
options. See [Writing content](/writing-content/).

```md
---
title: Example private guide
description: A placeholder guide that only logged-in readers can see.
---

Replace this with a real guide.
```

## Naming an org folder

**Name org folders in lowercase kebab-case, and make your token's `orgs`
values match exactly.**

The two sides are normalised differently, which is the whole trap. Astro
slugifies each folder name to build the URL; the value in your token is
compared verbatim, with no normalisation at all. They only meet when the
folder name is already slug-shaped:

- `Acme Labs` and `acme-labs` both slugify to `acme-labs`, so two folders
  named that way **merge into one org**.
- An org named `acme.co` in your token gets **no section at all** — dots are
  stripped, so the folder becomes `acmeco` and nothing matches. Renaming the
  folder cannot fix it; the token value is what has a dot in it.

Both fail silently: no error, just a sidebar that looks like the org has
nothing in it. If an org's section is missing, check this first.

`orgs/` is reserved inside `src/content/private-docs/` — it's the org-docs
URL space, so content placed there is dropped from the collection rather
than shadowing a real org route.

## `sidebar.hidden` is not access control

Frontmatter's `sidebar: { hidden: true }` (see [Navigation and the
sidebar](/navigation/)) keeps a page out of the nav. It does not restrict
who can open it: any signed-in reader who has the URL can still reach a
hidden private page, and any org member can reach a hidden page in a
different org's section if they know the URL.

To actually restrict a page, move it — into `org-docs/<org>/` for one
customer, or out of the private collections entirely.

The full security model — the guard's exact rules, and everything that sits
outside its reach — is in [Private and per-org docs](/internals/private-docs/).
