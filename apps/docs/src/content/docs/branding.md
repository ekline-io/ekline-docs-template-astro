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
guide](https://starlight.astro.build/guides/css-and-tailwind/#theming),
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
`--font-mono`. Fontsource packages the Google Fonts catalogue, so most fonts you
want are there — Inter and JetBrains Mono both are. For anything it doesn't
carry, follow Starlight's [CSS and Tailwind
guide](https://starlight.astro.build/guides/css-and-tailwind/) instead.

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

The homepage hero image is a placeholder too — `hero.image.file` in
`src/content/docs/index.mdx`. Point it at your own asset, or delete the
`image:` block for a text-only hero.

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

Starlight also exposes its own `--sl-*` variables — sidebar width, header
height, and more — for things that aren't Tailwind tokens. Set those in the
same file but **outside** `@theme`.

:::caution
Don't reorder the `@layer` declaration or the `@import` lines at the top of
`src/styles/global.css`. The order is what makes the cascade predictable, and
rearranging it changes which styles win in ways that are tedious to debug.
:::

## Going further

Cascade layers, the full `--sl-*` list, and what breaks if you reorder things
are covered in [Theming](/internals/theming/).

If you're rewriting most of `global.css` anyway, start from a community theme
instead — see Starlight's
[themes](https://starlight.astro.build/resources/themes/#community-themes).
