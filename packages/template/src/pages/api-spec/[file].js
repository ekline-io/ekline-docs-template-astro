/**
 * Serves the OpenAPI documents this site has to serve itself.
 *
 * Scalar renders a reference in the browser from a URL, so every document has
 * to be reachable over HTTP on the deployed site. A file in `public/` already
 * is — Astro copies that directory to the site root. Two kinds of `spec` are
 * not: a file kept elsewhere in your repository, and a remote URL you have
 * asked to be snapshotted (`serve: 'snapshot'`, the default). This endpoint
 * emits those, one static file each at `/api-spec/<id>.<ext>`, at build time.
 *
 * Which references that is comes from `emittedReferences` in
 * `src/config/api-reference.mjs`, the same list the tests read, so what the
 * config promises and what the build output contains cannot drift apart. As
 * shipped, both example references live in `public/` and this emits nothing.
 *
 * A static endpoint rather than a build hook copying files: Astro puts the
 * result wherever static assets go for the adapter in use, which differs
 * between the Node and Vercel adapters, and this file does not need to know.
 *
 * It serves the **raw** document — the bytes as read or fetched, not the
 * normalized, dereferenced copy the sidebar is built from. Scalar upgrades
 * older documents itself, and the "Download OpenAPI Document" link should hand
 * readers the file they would recognise. `loadSource` is memoised, so this
 * endpoint and the search index — both built from the Rollup-bundled SSR
 * copy of the app — share one read or fetch. The sidebar does not join that
 * cache: `astro.config.mjs` builds it from the module instance the Astro
 * config loader evaluates, a separate `sourceCache` from the one this file and
 * the search index share, so the sidebar always performs its own read or
 * fetch. For a remote document that is two HTTP requests per build, not one —
 * worth knowing if you are budgeting the 30-second fetch timeout against a
 * slow host, since the worst case is now two of those in series.
 *
 * ## Why this throws
 *
 * The sidebar generator warns and degrades on a bad document, so a typo does
 * not fail your first build. This is the one place that policy would be wrong:
 * if the document cannot be obtained here there is nothing to serve, and the
 * reference page would render blank. "Your spec URL is unreachable" is worth
 * hearing at build time rather than from a reader.
 */
import {
	emittedReferences,
	emittedFileFor,
	specUrlFor,
	isRemoteSpec,
} from '../../config/api-reference.mjs';
import { loadSource } from '../../lib/openapi-sidebar.mjs';

const CONTENT_TYPES = {
	json: 'application/json',
	yaml: 'application/yaml',
};

export function getStaticPaths() {
	return emittedReferences.map((reference) => ({
		params: { file: emittedFileFor(reference) },
		props: { reference },
	}));
}

/** @param {{ params: { file: string }, props: { reference: (typeof emittedReferences)[number] } }} context */
export async function GET({ params, props }) {
	const { reference } = props;

	let body;
	try {
		body = await loadSource(reference.spec);
	} catch (error) {
		throw new Error(
			`[api-spec] Could not ${isRemoteSpec(reference.spec) ? 'fetch' : 'read'} ` +
				`"${reference.spec}" for reference "${reference.id}": ${error?.message ?? error}\n` +
				`  Nothing to serve at ${specUrlFor(reference)}; the reference would render blank.`,
			{ cause: error }
		);
	}

	// `params.file` is the name `getStaticPaths` built from `emittedFileFor`,
	// which only ever ends `.json` or `.yaml` — so this reads the extension off
	// the route rather than rebuilding the filename to look at it again.
	const extension = params.file.endsWith('.json') ? 'json' : 'yaml';
	return new Response(body, {
		headers: { 'Content-Type': CONTENT_TYPES[extension] },
	});
}
