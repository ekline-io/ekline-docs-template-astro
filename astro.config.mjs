// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import starlightContextualMenu from '@ekline/starlight-contextual-menu';
import starlightLlmsTxt from 'starlight-llms-txt';
import tailwindcss from '@tailwindcss/vite';
import { openApiSidebarGroup } from './src/lib/openapi-sidebar.mjs';

// Every operation in `public/openapi.yaml`, as Starlight sidebar links pointing
// into the rendered reference. Regenerated on every build, so swapping in your
// own OpenAPI document updates the sidebar with no config changes here.
//
// Pointed at the embedded route, because that is the one that keeps Starlight's
// sidebar on screen — `/api/` uses the `splash` template and hides it, leaving
// Scalar's own sidebar to do the navigating. See `wiki/api-reference.md`.
const apiReferenceSidebar = await openApiSidebarGroup({
	spec: './public/openapi.yaml',
	base: '/api/embedded/',
	label: 'API reference',
});

// https://astro.build/config
export default defineConfig({
	// TODO: replace with your deployed site URL. Required for sitemap and llms-txt
	// to emit absolute URLs.
	site: 'https://example.com',
	integrations: [
		sitemap(),
		starlight({
			title: 'My Docs',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' }],
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
					projectName: 'My Docs',
					description:
						'A documentation site built with Astro Starlight. Replace this description with a one-paragraph summary of your project.',
				}),
			],
			sidebar: [
				{
					label: 'Get started',
					items: [
						{ label: 'Introduction', slug: 'get-started/introduction' },
						{ label: 'Quickstart', slug: 'get-started/quickstart' },
						{ label: 'Authentication', slug: 'get-started/authentication' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Example guide', slug: 'guides/example' },
						{ label: 'Send your first request', slug: 'guides/send-your-first-request' },
					],
				},
				{
					label: 'Concepts',
					items: [
						{ label: 'How it works', slug: 'concepts/how-it-works' },
						{ label: 'Glossary', slug: 'concepts/glossary' },
					],
				},
				{
					label: 'Reference',
					items: [{ autogenerate: { directory: 'reference' } }],
				},
				// Interactive API reference, rendered by Scalar from
				// `public/openapi.yaml`. The routes live in `src/pages/api/` rather
				// than in a Starlight plugin — Scalar renders the whole reference
				// itself, so there are no per-operation pages to autogenerate.
				//
				// The group below is generated from the spec (see the import at the
				// top of this file), so it lists every operation grouped by tag and
				// needs no maintenance when the document changes.
				apiReferenceSidebar,
				{ label: 'API reference (full width)', link: '/api/' },
				{
					label: 'Changelog',
					slug: 'changelog',
				},
			],
		}),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
