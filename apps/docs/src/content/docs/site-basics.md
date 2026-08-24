---
title: Site basics
description: The site title, its social links, its favicon, and where its URL comes from.
---

All of it lives in `astro.config.mjs`, in the object you pass to `starlight()`.

## Title

```js
starlight({
  title: 'My Docs',
  // ...
});
```

Sets the browser tab and the text in the header. Leave it alone and every
page says **My Docs** — replace it with your product or company name.

## Site URL

The `site` field (or `DOCS_SITE_URL`) is what the sitemap and `llms.txt` use
to emit absolute URLs — covered in full on [Deploy](/deploy/), including what
ships if you leave it unset. Set it once; nothing else on this page depends
on it.

## Social links

```js
social: [
  {
    icon: 'github',
    label: 'GitHub',
    href: 'https://github.com/ekline-io/ekline-docs-template-astro',
  },
],
```

Each entry is an icon button in the header. Leave this alone and your docs
site links to **this template's own repository**, not yours — the
`astro.config.mjs` comment above it flags this as a TODO for exactly that
reason. Point `href` at your own repo (or delete the entry if you don't want
one), and add more entries — Discord, X, npm, whatever's relevant — using any
icon name from [Starlight's icon set](https://starlight.astro.build/reference/icons/).

## Favicon

Starlight looks for `favicon` in the `starlight()` config; leave it unset and
it defaults to `/favicon.svg`, resolved against `public/`. The template
ships a placeholder icon at exactly that path
(`public/favicon.svg`), so the site already has a favicon out of the box —
just not one that's yours.

To replace it, either:

- Overwrite `public/favicon.svg` with your own file, keeping the name, or
- Point `favicon` at a different path in `public/`:

  ```js
  starlight({
    favicon: '/my-favicon.png',
  });
  ```

`.ico`, `.gif`, `.jpg`, `.png`, and `.svg` all work.
