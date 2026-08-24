// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import starlightContextualMenu from '@ekline/starlight-contextual-menu';
import starlightLlmsTxt from 'starlight-llms-txt';
import tailwindcss from '@tailwindcss/vite';
import { docsSidebarGroups } from './src/config/sidebar.mjs';

// `loadEnv`, not `process.env`. Astro does not load `.env` files into
// `process.env` by the time this file runs, so reading it directly reports
// "unset" during local development — the one place `DOCS_SITE_URL` is easiest
// to try. `loadEnv` reads the `.env` files *and* the real environment, so it
// is right whether the value comes from a local `.env` or from Vercel/CI.
const { DOCS_SITE_URL } = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');

// https://astro.build/config
export default defineConfig({
	// TODO: replace the `https://example.com` fallback below with your deployed
	// site URL — the string only, leaving `DOCS_SITE_URL ||` in place — or set
	// `DOCS_SITE_URL` in the build environment and leave this line alone. It
	// comes from the same `loadEnv` above, so a local `.env` works too.
	// Required for sitemap and llms-txt to emit absolute URLs.
	//
	// Replacing the whole expression with a bare string also works, but it
	// silently stops `DOCS_SITE_URL` doing anything — which is how a preview
	// deployment ends up emitting production URLs in its sitemap with no error
	// to notice.
	//
	// `||`, not `??`: `loadEnv` returns `''` for a bare `DOCS_SITE_URL=`, and
	// Astro rejects an empty `site` outright (its schema is `z.string().url()`).
	// An empty assignment should mean "unset", not "fail the build".
	site: DOCS_SITE_URL || 'https://example.com',
	integrations: [
		sitemap(),
		starlight({
			title: 'EkLine docs template',
			// TODO: point this at your own repository. It ships aimed at the
			// template so the live preview links somewhere useful — it was the
			// Starlight starter's own repo until now, which is not what a reader
			// of your docs is looking for.
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/ekline-io/ekline-docs-template-astro',
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
					projectName: 'EkLine docs template',
					description:
						'Documentation for the EkLine docs template — an Astro Starlight documentation site with a logged-in experience and interactive API references pre-wired, ready to fork and customize.',
				}),
			],
			// The nav groups are declared in `src/config/sidebar.mjs`. Edit that,
			// not this. Empty for now — see that file's docstring.
			sidebar: [...docsSidebarGroups],
		}),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
