import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { wikiLoader } from './loaders/wiki.mjs';

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	// The Internals section (`/internals/`): `packages/template/wiki/*.md`,
	// read live from outside this project's root rather than copied in — see
	// `src/loaders/wiki.mjs` for why. Kept out of `docs` deliberately, not as
	// an oversight: these entries don't live under `src/content/docs/`, so
	// nothing that assumes that (llms.txt, the `.md` twin routes) should
	// treat them as if they did. `src/pages/internals/[...slug].astro` renders
	// this collection through `StarlightPage`, the same mechanism
	// `packages/template/src/pages/private/[...slug].astro` uses.
	wiki: defineCollection({ loader: wikiLoader(), schema: docsSchema() }),
};
