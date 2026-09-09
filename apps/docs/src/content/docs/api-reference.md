---
title: API reference
description: Point src/config/api-reference.mjs at your OpenAPI document — bundled, elsewhere in your repo, or at a URL — and choose between Starlight's sidebar and Scalar's full-width shell.
---

Every API reference is one entry in **`src/config/api-reference.mjs`** — the
route, the sidebar group and the search index are all generated from that
list, so it's the only file to touch.

## Where your document lives

`spec` is the one field that says where the document is. It takes a path or a
URL, and everything else — the address the reader's browser loads, whether the
build serves a copy — follows from it.

### Bundled with the site

```js
spec: './public/openapi.yaml',
```

Replace that file with your own. Anything under `public/` is served from the
site root, so the browser loads it from `/openapi.yaml`. JSON works as well as
YAML, and Swagger 2.0 / OpenAPI 3.0 documents upgrade to 3.1 automatically —
nothing else to change.

### Elsewhere in your repository

```js
spec: '../api/openapi.yaml',
```

Point at the file where it already is — a monorepo's API package, a file your
build generates. The template reads it at build time and serves a copy at
`/api-spec/<id>.yaml` (or `.json`, following the source), so nothing is
duplicated into `public/` and the two can't drift.

### At a remote URL

```js
spec: 'https://api.example.com/openapi.yaml',
serve: 'snapshot', // or 'live'
```

The build fetches the document to generate the sidebar and the search index —
the same sidebar a bundled document gets. `serve` decides how it reaches the
reader's browser:

| `serve` | The browser loads | Suits |
| --- | --- | --- |
| `'snapshot'` (default) | a copy the build saved, from your own site at `/api-spec/<id>.yaml` | Most cases. No CORS setup on the API host, and the reference can't render blank because that host was down. The copy updates when you rebuild. |
| `'live'` | the URL itself, on every visit | A document that changes more often than you deploy. The host must allow cross-origin requests from your docs site. |

Either way, **the machine running the build must be able to reach the URL.**
If it can't, a `snapshot` build fails with the URL in the error; a `live` build
succeeds with a warning, and the reference has no operation sidebar and isn't
searchable until the next build that can reach it.

To keep a snapshot current without a manual deploy, trigger a rebuild from
your API's release pipeline — on Vercel, a
[deploy hook](https://vercel.com/docs/deploy-hooks) is one URL to `POST`.

:::note[Upgrading from an earlier version]
Entries that set `specUrl` keep working: an explicit `specUrl` is used as-is
and nothing is derived or served for you. None of the three cases above needs
it, so drop it the next time you touch the entry.
:::

## Two layouts

The template ships two example references, one per layout, so you can see
both running on real content before choosing:

| Layout | What it looks like | Suits |
| --- | --- | --- |
| `docs` | The full Starlight page — same header, same sidebar as the rest of the site. Every operation is listed in that sidebar, generated from your document. | Most sites: the reference reads as part of the documentation rather than a separate destination. |
| `full` | Scalar's own shell, full width — Starlight's sidebar steps aside. | Large documents: Scalar's sidebar is virtualized, so it stays responsive where a fully expanded Starlight tree would not. |

Set `layout: 'docs'` or `layout: 'full'` on the reference and leave
everything else — the sidebar switches between an operation list and a
plain link on its own.

There's deliberately no reader-facing control for switching between them.
That would be meta-UI about the documentation, not documentation. Pick one
layout per reference and leave it.

## Keep one, or keep both

Delete the entry you don't want from `apiReferences`, and delete its
document from `public/`. Its route, sidebar entries and search entries all
go with it — the shipped Payments and Admin examples are meant for you to
remove at least one of.

Keeping both is fine too; plenty of products document more than one API.

:::note
Two references sharing a `slug` fails the build with a named error rather
than shipping one of them unreachable — `api-reference.mjs` checks for it
before anything renders.
:::

Next: [what the template turns off by default, and how to theme what's
left](/api-reference-appearance/).
