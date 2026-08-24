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

The folder name is the org slug your product's token lists in its `orgs`
claim, compared **exactly** — not lowercased, not slugified. Name folders
in lowercase kebab-case and match them to the token's values verbatim:

- `Acme Labs` and `acme-labs` are two different things in that comparison,
  even though Astro's own content loader would otherwise treat them as the
  same folder.
- An org named `acme.co` in your token gets no section at all if the folder
  is named anything else — silently, with no error, just a sidebar that
  looks like the org has nothing in it.

If an org's section is missing, this is the first thing to check.

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
