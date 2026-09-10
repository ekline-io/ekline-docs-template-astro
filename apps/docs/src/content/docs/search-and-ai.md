---
title: Search and AI
description: Full-text search, llms.txt, and the per-page "copy / open in ChatGPT" menu — what each does out of the box.
---

## Search

Starlight ships [Pagefind](https://pagefind.app/) and turns it on by
default — nothing to configure. Every page gets indexed on build, and the
search bar in the header works as soon as you deploy.

To drop one page from the index, set its frontmatter:

```yaml
---
pagefind: false
---
```

To drop part of a page — a repeated navigation block, say — add
`data-pagefind-ignore` to the element around it.

To turn search off site-wide, set `pagefind: false` in the `starlight()`
config. Leaving it unset means `true`; setting it also hides the search
button, not just the index.

:::caution
The template overrides Starlight's `Search` component
(`src/components/CustomSearch.astro`) so search keeps working after
client-side navigation. Don't swap it back for Starlight's default while
`<ClientRouter />` is on — search breaks silently, with the button still
rendering.
:::

## llms.txt

`starlight-llms-txt` generates `/llms.txt`, `/llms-full.txt`, and
`/llms-small.txt` on every build — already wired into the `plugins` array,
nothing to turn on. These files need `site` (or `DOCS_SITE_URL`) set to emit
correct absolute URLs; see [Deploy](/deploy/).

```js
starlightLlmsTxt({
  projectName: 'My Docs',
  description: 'A documentation site built with Astro Starlight. Replace this description with a one-paragraph summary of your project.',
}),
```

| Option | Leave it alone and... |
| --- | --- |
| `projectName` | Falls back to Starlight's `title` — but the template sets it explicitly to `'My Docs'`, so update this alongside `title`. |
| `description` | Falls back to Starlight's own `description` field (this template doesn't set one) — but the plugin config carries its own placeholder sentence instead. Replace it with an actual summary of your docs. |
| `promote` | Defaults to `['index*']` — the homepage sorts first in the output. Add more [micromatch](https://github.com/micromatch/micromatch) patterns to pull other pages to the top. |
| `demote` | Defaults to none. Same syntax as `promote`, for pages you want at the bottom instead. |
| `exclude` | Defaults to none. Slugs or globs to leave out of `llms-small.txt` specifically. |

## The contextual menu

`@ekline/starlight-contextual-menu` adds the **Copy / View / Open in Claude /
Open in ChatGPT** dropdown next to every page's heading, and generates a
`/<slug>.md` route for every page so those actions have raw Markdown to link
to.

```js
starlightContextualMenu({
  actions: ['copy', 'view', 'claude', 'chatgpt'],
  injectMarkdownRoutes: true,
}),
```

| Option | Leave it alone and... |
| --- | --- |
| `actions` | Defaults to `['copy', 'view']` — the template adds `'claude'` and `'chatgpt'`. Order sets the dropdown order; the first entry is also the primary button. Two more actions exist but aren't enabled: `'lechat'`, `'grok'`. |
| `injectMarkdownRoutes` | Defaults to `true`, same as the template's explicit setting — every page gets its `/<slug>.md` twin. Set to `false` only if something else already serves those routes. |
| `hideMainActionLabel` | Defaults to `false` — the primary button shows text, not just an icon. |

The `<link rel="alternate" type="text/markdown">` tag that lets crawlers
discover each page's Markdown twin is already wired into
`src/components/CustomHead.astro` — nothing to add for it to work.

## Markdown for AI agents

Two ways to get a page as Markdown, and every page supports both:

- **The `.md` twin.** `/guides/example/` has `/guides/example.md`. It is what
  the contextual menu links to and what the `<link rel="alternate">` tag
  advertises, so crawlers find it without guessing.
- **Content negotiation.** On Vercel, the page's own URL answers a request
  with `Accept: text/markdown` by serving the twin:

  ```bash
  curl -H 'Accept: text/markdown' https://your-site/guides/example/ | head
  ```

  Browsers never send that header and see no change.

Negotiation is provided by `vercelMarkdownNegotiation()` in `astro.config.mjs`
— an integration that adds routes to the Vercel adapter's generated routing
config after the build. Two things follow from that:

- **It needs `@astrojs/vercel`.** The template ships with it. If you follow
  [Removing what you don't need](/removing-features/), keep the adapter when
  you deploy to Vercel — that is how Vercel's features reach a static site.
  This site is built that way.
- **Delete the line to turn it off.** Off Vercel it does nothing.

Pages with no `.md` twin — this site's Internals pages, the template's API
reference — are simply not in the route table, and answer a Markdown request
with their HTML, as before.

One limit, documented rather than fixed: quality values are not evaluated.
`text/html, text/markdown;q=0.1` gets Markdown. No browser or known agent
sends that.

**To check a deployment,** the template ships an opt-in smoke test:
`DOCS_SMOKE_URL=https://your-site node --test tests/deployed-smoke.test.mjs`.
It is the only test that can see Vercel's router; `npm test` cannot, which is
how this feature once broke without a test noticing. Details in the
[Internals](/internals/private-docs/#markdown-content-negotiation-on-vercel).
