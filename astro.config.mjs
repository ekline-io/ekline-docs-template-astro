// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import starlightContextualMenu from '@ekline/starlight-contextual-menu';
import starlightLlmsTxt from 'starlight-llms-txt';
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi';
import tailwindcss from '@tailwindcss/vite';

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
				// Generates reference pages under `/api/` from the OpenAPI spec.
				// Replace `src/schemas/api.yaml` with your own spec (YAML or JSON).
				starlightOpenAPI([
					{
						base: 'api',
						label: 'API reference',
						schema: './src/schemas/api.yaml',
					},
				]),
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
				// API reference pages auto-generated from `src/schemas/api.yaml`.
				...openAPISidebarGroups,
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
