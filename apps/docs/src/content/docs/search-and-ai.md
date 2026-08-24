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
(`src/components/CustomSearch.astro`) to fix a real bug: Pagefind only binds
itself to the search dialog on the page's first load, so under `<ClientRouter
/>`'s client-side navigation, every page after the first would show an empty
search box. If you replace that override with Starlight's default `Search`
component while `<ClientRouter />` stays on, search breaks the same way
again — silently, since the button still renders.
:::

## llms.txt

`starlight-llms-txt` generates `/llms.txt`, `/llms-full.txt`, and
`/llms-small.txt` on every build — already wired into the `plugins` array,
nothing to turn on. Both files need `site` (or `DOCS_SITE_URL`) set to emit
correct absolute URLs; see [Site basics](/site-basics/).

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
