---
title: Branding and theming
description: Colors, fonts, logo, and custom CSS — where each one lives and what you get if you leave it alone.
---

Colors and fonts live in one file, `src/styles/global.css`. The logo lives in
`astro.config.mjs`. Nothing else needs to change for either.

:::note
This page covers what to edit and what ships by default. For the mechanics —
why the file is laid out this way, the cascade-layer order, and why it can't
be reordered — see [Theming](/internals/theming/) in Internals.
:::

## Colors

```css
@theme {
	--color-accent-500: var(--color-violet-500);
	/* ...50 through 950 */
	--color-gray-500: var(--color-slate-500);
	/* ...50 through 950 */
}
```

`--color-accent-*` drives links, the active sidebar item, and primary
buttons; leave it alone and you get Tailwind's `violet` palette.
`--color-gray-*` is backgrounds, borders, and body text; leave it alone and
you get Tailwind's `slate` palette.

To change either: open Starlight's [CSS variable theming
guide](https://starlight.astro.build/guides/css-and-tailwind/#theming-with-css-variables),
generate a palette from your brand color, and paste the values it gives you
over the matching lines in `src/styles/global.css`.

## Fonts

```css
--font-sans:
  'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI',
  Roboto, 'Helvetica Neue', Arial, sans-serif;
--font-mono:
  'JetBrains Mono Variable', ui-monospace, SFMono-Regular, 'SF Mono', Menlo,
  Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
```

Leave these alone and the site uses **Inter** for body text and UI, **JetBrains
Mono** for code — both self-hosted via `@fontsource-variable`, so nothing is
fetched from Google Fonts at runtime.

To swap one: install a `@fontsource-variable/<font>` package, add an
`@import` for it above the `@theme` block (next to the existing Inter/JetBrains
Mono imports), then put the family name first in `--font-sans` or
`--font-mono`. For a font that isn't on Fontsource — Google Fonts included —
follow Starlight's [web fonts
recipe](https://starlight.astro.build/guides/css-and-tailwind/#custom-fonts)
instead.

## Logo

Unset by default: the header shows your `title` text and nothing else. To
add an image, set `logo` in the `starlight()` config:

```js
starlight({
  logo: {
    src: './src/assets/my-logo.svg',
  },
});
```

Use `light` / `dark` instead of `src` if you need different files per theme.
By default the logo sits next to your title text; add `replacesTitle: true`
to show only the logo. Full shape (including the `alt` text option) is in
[Starlight's configuration reference](https://starlight.astro.build/reference/configuration/#logo).

## Custom CSS

Anything beyond a design token goes in the same file, inside a Tailwind
layer:

```css
@layer components {
	.callout {
		@apply rounded-lg border border-(--sl-color-gray-5) p-4;
	}
}
```

Tailwind utility classes also work directly in MDX and Astro files once the
Vite plugin is loaded — which it already is, for every page.

Starlight also exposes its own `--sl-*` variables (sidebar width, header
height, and more) for things that aren't Tailwind tokens. Set those in the
same file but **outside** `@theme` — see Starlight's [Styling with
CSS](https://starlight.astro.build/guides/css-and-tailwind/#styling-with-css)
reference for the full list.

:::caution
Don't reorder the `@layer` declaration or the `@import` lines at the top of
`src/styles/global.css`. Starlight's layer has to sit between Tailwind's
`base` and `theme` layers or its component styles stop winning the cascade —
see the [Starlight + Tailwind
guide](https://starlight.astro.build/guides/css-and-tailwind/#tailwind-css).
:::

## When CSS isn't enough

If you're rewriting most of `global.css` anyway, a community theme may get
you closer faster than hand-tuning every variable — `starlight-theme-rapide`
and `starlight-theme-flexoki` are two starting points. Full list at the
[Starlight plugin showcase](https://starlight.astro.build/resources/plugins/#themes).

If a color change doesn't show up in the dev server, hard-refresh the
browser — Tailwind v4's CSS layers cache aggressively.
