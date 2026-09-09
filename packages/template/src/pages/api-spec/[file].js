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
 * readers the file they would recognise. `loadSource` is memoised, so the
 * sidebar, the search index and this endpoint share one read or fetch.
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

/** @param {{ props: { reference: (typeof emittedReferences)[number] } }} context */
export async function GET({ props }) {
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

	const extension = emittedFileFor(reference).split('.').pop();
	return new Response(body, {
		headers: { 'Content-Type': CONTENT_TYPES[extension] ?? CONTENT_TYPES.yaml },
	});
}
