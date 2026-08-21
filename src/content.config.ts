import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	// The logged-in experience, kept OUTSIDE `docs` on purpose. That is a real
	// barrier for two of the four build-time surfaces and only a consequence of
	// routing for the other two. llms.txt and the `.md` twin routes read
	// `getCollection('docs')` by name, so they cannot reach these entries at
	// all. Pagefind crawls the HTML the build emits and the sitemap walks the
	// build's routes, so those two stay clean only while everything under
	// src/pages/private/ sets `prerender = false` — and the sitemap lists any
	// non-dynamic on-demand route even so, which is why astro.config.mjs
	// filters /private/ out of it. Uses docsSchema() so frontmatter is
	// identical to public docs.
	privateDocs: defineCollection({
		// `orgs/` is reserved: /private/orgs/** is the org-docs URL space, so a
		// same-named folder here would be unreachable. Content placed there is
		// dropped from this collection rather than shadowing a real org route.
		loader: glob({ pattern: ['**/[^_]*.{md,mdx}', '!orgs/**'], base: './src/content/private-docs' }),
		schema: docsSchema(),
	}),
	// One folder per org; folder name = org slug in the SSO token's `orgs` claim.
	orgDocs: defineCollection({
		loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/org-docs' }),
		schema: docsSchema(),
	}),
};
