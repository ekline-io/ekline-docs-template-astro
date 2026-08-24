# Theming

This template uses Tailwind CSS v4 with Starlight. The whole theme lives in one file: `src/styles/global.css`. To retheme the site, edit that file. No other files need to change.

## How it works

Two pieces wire it together:

1. `astro.config.mjs` loads the Tailwind v4 Vite plugin and points Starlight at the global stylesheet:
   ```js
   import tailwindcss from '@tailwindcss/vite';

   starlight({
     // ...
     customCss: ['./src/styles/global.css'],
   });

   // and in the top-level config:
   vite: { plugins: [tailwindcss()] }
   ```
2. `src/styles/global.css` sets the cascade-layer order, imports Starlight's compatibility CSS (`@astrojs/starlight-tailwind`), pulls in Tailwind v4's `theme` and `utilities` layers, and exposes a `@theme { ... }` block. That block is where you set design tokens like colors and fonts.

> **Do not reorder the `@layer` declaration or the `@import` lines.** In `@layer base, starlight, theme, components, utilities`, later layers win — so Tailwind's utilities override Starlight's component styles, which is the point. Starlight documents the order as what makes the cascade predictable rather than giving a causal rule, so treat it as fixed: rearranging it changes which styles win in ways that are tedious to debug. See the [Starlight + Tailwind guide](https://starlight.astro.build/guides/css-and-tailwind/#tailwind-css).

## Updating the theme

### 1. Change the accent color

The accent color drives links, the active sidebar item, and primary buttons. Use the official Starlight palette generator:

1. Open <https://starlight.astro.build/guides/css-and-tailwind/#theming>.
2. Pick an accent color and a gray scale.
3. Copy the `--color-accent-*` and `--color-gray-*` values it shows.
4. Paste them inside the `@theme { ... }` block in `src/styles/global.css`. Replace the matching lines that ship with the template.

The defaults in this template alias Tailwind's `violet` accent and `slate` gray. Most teams swap these for brand colors.

### 2. Change fonts

Edit `--font-sans` and `--font-mono` in the `@theme` block. To use a self-hosted font, follow the [Starlight web fonts recipe](https://starlight.astro.build/guides/css-and-tailwind/). Declare an `@font-face` above `@theme`, then name the family in `--font-sans` or `--font-mono`.

### 3. Add custom utilities or component styles

Anything beyond design tokens goes inside Tailwind layers in the same file:

```css
@layer components {
	.callout {
		@apply rounded-lg border border-(--sl-color-gray-5) p-4;
	}
}
```

Tailwind utility classes also work directly inside MDX, Astro components, and Starlight component slots once the Vite plugin is in place.

### 4. Override Starlight's own CSS variables

Starlight exposes a long list of `--sl-*` variables for things like sidebar width and header height. See the [Styling with CSS](https://starlight.astro.build/guides/css-and-tailwind/#custom-css-styles) reference. Set these in the same file, but **outside** `@theme`, since they are not Tailwind tokens:

```css
:root {
	--sl-sidebar-width: 18rem;
}
```

## Verifying changes

```bash
npm run dev      # live-reload preview at http://localhost:4321/
npm run build    # confirms no Tailwind or CSS errors before pushing
```

If a color change does not show up, hard-refresh the browser. Tailwind v4's CSS layers cache aggressively.

## When to reach for something heavier

If you find yourself writing a lot of custom CSS, swap in a community theme instead of hand-tuning every variable. Some popular options are `starlight-theme-rapide` and `starlight-theme-flexoki`. The full list lives at <https://starlight.astro.build/resources/themes/#community-themes>.
