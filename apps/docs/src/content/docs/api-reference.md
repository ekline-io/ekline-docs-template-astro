---
title: API reference
description: Wire your OpenAPI document into src/config/api-reference.mjs, and choose between Starlight's sidebar and Scalar's own full-width shell.
---

Every API reference is one entry in **`src/config/api-reference.mjs`** — the
route, the sidebar group and the search index are all generated from that
list, so it's the only file to touch.

## Add your document

Point the reference you're keeping at your own spec:

```js
spec: './public/openapi.yaml', // read at build time, to generate the sidebar
specUrl: '/openapi.yaml', // fetched by the browser, at runtime
```

Replace the file at that path in `public/` with your own document. JSON
works as well as YAML, and Swagger 2.0 / OpenAPI 3.0 documents upgrade to
3.1 automatically — nothing else to change.

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
