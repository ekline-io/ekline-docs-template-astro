// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import starlightContextualMenu from '@ekline/starlight-contextual-menu';
import starlightLlmsTxt from 'starlight-llms-txt';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
// One copy of the integration, in the template — imported across the repo the
// way `src/loaders/wiki.mjs` reads the template's wiki. This site is not
// shipped to anyone, so the cross-directory import that would be wrong inside
// `packages/template` is the right shape here.
import vercelMarkdownNegotiation from '../../packages/template/src/lib/vercel-markdown-negotiation.mjs';
import { docsSidebarGroups } from './src/config/sidebar.mjs';

// https://astro.build/config
export default defineConfig({
	// Hardcoded, unlike the template's, and deliberately so. The template makes
	// this an env var because one build serves many customers' environments and
	// its `site` ships as a placeholder each of them replaces. This site has one
	// domain that EkLine owns, so the env var bought nothing and cost a silent
	// failure: forget to set it on the Vercel project and every page ships a
	// `<link rel="canonical">` pointing at a domain we do not own, telling search
	// engines the real page lives elsewhere. That happened — the first production
	// build emitted `https://example.com/` canonicals and sitemap entries.
	//
	// In the repo it is reviewed and cannot be forgotten at deploy time. Preview
	// deployments emit production canonicals, which is fine here: previews should
	// not be indexed anyway.
	site: 'https://potluck-docs.vercel.app',
	// Vercel builds set VERCEL=1. Nothing here renders on demand, so the adapter
	// changes only where the static output lands (`.vercel/output/static/`) and
	// the routing config that serves it — which is what markdown negotiation
	// edits. Everywhere else this is a plain static build into `dist/`. It is
	// the shape the template's removal path documents; this site is that path,
	// built.
	adapter: process.env.VERCEL ? vercel() : undefined,
	integrations: [
		sitemap(),
		starlight({
			title: 'Potluck Docs',
			// Two files, not one. The mark's well is paper on light and ink on
			// dark, so a single image would put a white disc on the dark header —
			// the brand package's first "Do not". Starlight swaps these itself.
			logo: {
				light: './src/assets/potluck-mark-light.svg',
				dark: './src/assets/potluck-mark-dark.svg',
				alt: 'Potluck Docs',
			},
			// TODO: point this at your own repository. It ships aimed at the
			// template so the live preview links somewhere useful — it was the
			// Starlight starter's own repo until now, which is not what a reader
			// of your docs is looking for.
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/ekline-io/potluck-docs',
				},
			],
			customCss: ['./src/styles/global.css'],
			components: {
				Head: './src/components/CustomHead.astro',
				Header: './src/components/CustomHeader.astro',
				Hero: './src/components/CustomHero.astro',
				Footer: './src/components/CustomFooter.astro',
				// Re-init Pagefind after every Astro view-transition swap — the
				// upstream component only initializes on `DOMContentLoaded`,
				// which doesn't fire on subsequent <ClientRouter /> navigations.
				Search: './src/components/CustomSearch.astro',
				// Replaces Starlight's native <select> with the light/dark control
				// configured in `src/config/theme.mjs` — a popover menu by default,
				// a segmented pill, or nothing at all. It owns the theme logic that
				// used to live in upstream's component: read that file, and the
				// config, before changing either.
				ThemeSelect: './src/components/ThemeSelect.astro',
				// Applies the theme before first paint, and enforces the pinned
				// theme when `src/config/theme.mjs` hides the control. Overriding
				// this is also what re-applies `data-theme` after a view transition
				// once there is no control on the page to do it.
				ThemeProvider: './src/components/ThemeProvider.astro',
			},
			plugins: [
				// Adds a "Copy / View / Open in Claude / Open in ChatGPT" dropdown to
				// each page heading. `injectMarkdownRoutes: true` generates a `.md`
				// route per page so the View / Claude / ChatGPT actions can deep-link
				// to raw markdown.
				starlightContextualMenu({
					actions: ['copy', 'view', 'claude', 'chatgpt'],
					injectMarkdownRoutes: true,
				}),
				starlightLlmsTxt({
					projectName: 'Potluck Docs',
					description:
						'Documentation for Potluck Docs — an Astro Starlight documentation template with a logged-in experience and interactive API references pre-wired, ready to fork and customize.',
				}),
			],
			// The nav groups are declared in `src/config/sidebar.mjs`. Edit that,
			// not this. Empty for now — see that file's docstring.
			sidebar: [...docsSidebarGroups],
		}),
		// On Vercel, a request to a page with `Accept: text/markdown` gets the
		// page's Markdown twin at the same URL. Does nothing off Vercel.
		vercelMarkdownNegotiation(),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
