/**
 * Build Starlight sidebar entries from an OpenAPI document.
 *
 * The API reference is rendered by Scalar, which draws its own operation list.
 * That is fine when Scalar owns the page, but on a route that keeps Starlight's
 * sidebar there is otherwise no operation-level navigation at all — the sidebar
 * carries one entry for the entire reference, so finding an endpoint means
 * scrolling. This module closes that gap: every operation, grouped by tag, as
 * real Starlight sidebar links.
 *
 * ## Why this is generated rather than written by hand
 *
 * This is a template. Customers replace `public/openapi.yaml` with their own
 * document, and the sidebar has to follow without anyone editing config. So the
 * entries are derived from the spec at build time — add an endpoint, rebuild,
 * and it appears.
 *
 * ## Why it uses Scalar's own navigation builder
 *
 * Each link is an anchor into the rendered reference, so its hash has to match
 * the ID Scalar assigns that operation — exactly, including how it slugifies
 * tags and strips punctuation from webhook names (`payment.succeeded` becomes
 * `paymentsucceeded`, with the dot dropped rather than hyphenated).
 *
 * Rather than reimplement those rules and watch them drift, this calls
 * `createNavigation` from `@scalar/workspace-store` — the same builder the
 * reference itself uses. The IDs come from Scalar, so both sides move together
 * on `npm update` instead of silently disagreeing.
 *
 * There is no plugin for this. Scalar's Astro integration renders a reference
 * but exposes nothing to Starlight's sidebar, and `starlight-openapi` builds a
 * sidebar only for pages it generates itself. The gap is a known request
 * upstream (scalar/scalar discussion #4758).
 *
 * ## Failure behaviour
 *
 * A customer's first build must not die because their spec has a typo. Every
 * failure here degrades to a single link to the reference and a warning on
 * stderr — the site still builds, the reference still renders, and only the
 * per-operation entries are missing.
 */
import { readFile } from 'node:fs/promises';
import { createNavigation } from '@scalar/workspace-store/navigation';
import { normalize, upgrade, dereference } from '@scalar/openapi-parser';

/**
 * Namespace Scalar prefixes onto every generated ID. Stripped to get the hash
 * the rendered page actually uses — the value itself is arbitrary and never
 * reaches the browser.
 */
const DOCUMENT_NAME = 'openapi';

/** Entry types that become sidebar links. */
const LINKABLE = new Set(['operation', 'webhook']);

/**
 * HTTP method to Starlight badge variant.
 *
 * Follows the usual API-docs convention (read is blue, create is green,
 * destructive is red) so the colours mean what a reader already expects.
 */
const METHOD_VARIANT = {
	get: 'note',
	head: 'note',
	options: 'note',
	post: 'success',
	put: 'caution',
	patch: 'caution',
	delete: 'danger',
	trace: 'default',
};

/**
 * Report a degraded build on stderr.
 *
 * Always a warning, never a throw: a customer's first build must not die
 * because their document has a typo. The site still builds and the reference
 * still renders — only the generated extras are missing, so the message has to
 * say which.
 */
function warn(spec, error, consequence) {
	console.warn(
		`[openapi-sidebar] Could not process "${spec}": ${error?.message ?? error}\n` +
			`  ${consequence}`
	);
}

/** Depth-first walk over the navigation tree. */
function* walk(entries) {
	for (const entry of entries ?? []) {
		yield entry;
		yield* walk(entry.children);
	}
}

/** The prefix `createNavigation` puts on every ID it generates. */
const ID_PREFIX = `${DOCUMENT_NAME}/`;

/**
 * Strip Scalar's document prefix to get the in-page anchor.
 *
 * Guarded rather than a blind `slice`: every ID is prefixed today, but an
 * unprefixed one would silently lose its first characters and produce a link
 * that renders perfectly and scrolls nowhere. `null` lets callers skip the
 * entry instead of emitting a broken one.
 */
function anchorFor(id) {
	const value = String(id);
	return value.startsWith(ID_PREFIX) ? value.slice(ID_PREFIX.length) : null;
}

/**
 * Read and fully resolve an OpenAPI document, once per path per build.
 *
 * `normalize` accepts YAML or JSON, `upgrade` lifts Swagger 2.0 and OpenAPI 3.0
 * documents to 3.1, and `dereference` resolves `$ref`s — so a customer's spec
 * works whatever shape it arrives in.
 *
 * Memoised because the sidebar and the search index each need the document and
 * are built from different places (config evaluation, then component render).
 * Dereferencing dominates the cost on a large spec, and paying it twice per
 * build is pure waste. The promise is cached, not the result, so concurrent
 * callers share one read rather than racing.
 */
const documentCache = new Map();

function loadDocument(specPath) {
	const cached = documentCache.get(specPath);
	if (cached) return cached;

	const pending = (async () => {
		const raw = await readFile(specPath, 'utf-8');
		const { specification } = upgrade(normalize(raw));
		// `dereference` is synchronous despite the name — no `await` here.
		const { schema } = dereference(specification);
		return schema ?? specification;
	})();

	// Drop failures from the cache so a later call can retry — a dev server
	// rebuilds after the customer fixes the file, and a cached rejection would
	// keep reporting the old error forever.
	pending.catch(() => documentCache.delete(specPath));

	documentCache.set(specPath, pending);
	return pending;
}

/**
 * Every operation and webhook in the document, flattened.
 *
 * Shared by the sidebar and the search index so both describe the same set from
 * the same source — a sidebar listing an operation that search cannot find (or
 * the reverse) is the kind of drift nobody notices until a reader reports it.
 *
 * @param {object} options
 * @param {string} options.spec Path to the OpenAPI document on disk.
 * @returns Operations with the anchor each one lives at. Empty if the document
 *   cannot be read — callers render nothing rather than failing the build.
 */
export async function openApiOperations({ spec }) {
	let document;
	try {
		document = await loadDocument(spec);
	} catch (error) {
		// Warn here too. The sidebar reports its own failure, but the two are
		// built at different moments from different call sites, so this one can
		// fail alone — and a search that silently indexes no operations is
		// indistinguishable from a search that found nothing.
		warn(spec, error, 'The API reference is not searchable by operation.');
		return [];
	}

	try {
		const navigation = createNavigation(DOCUMENT_NAME, document, {});
		const operations = [];

		for (const tag of navigation.children ?? []) {
			if (tag.type !== 'tag') continue;

			for (const child of walk(tag.children)) {
				if (!LINKABLE.has(child.type)) continue;

				const anchor = anchorFor(child.id);
				if (!anchor) continue;

				operations.push({
					title: child.title ?? child.name,
					method: child.method ? String(child.method).toUpperCase() : '',
					anchor,
					tag: tag.title ?? tag.name,
					isWebhook: child.type === 'webhook',
				});
			}
		}

		return operations;
	} catch (error) {
		warn(spec, error, 'The API reference is not searchable by operation.');
		return [];
	}
}

/**
 * Build a Starlight sidebar group from an OpenAPI document.
 *
 * @param {object} options
 * @param {string} options.spec       Path to the OpenAPI document on disk.
 * @param {string} options.base       Route the reference is rendered at, e.g. `/api/`.
 * @param {string} [options.label]    Group label in the sidebar.
 * @param {boolean} [options.collapsed] Start the group collapsed. On by default —
 *   the sidebar is global, so an expanded API tree would otherwise dominate
 *   every prose page in the site.
 * @param {boolean} [options.badges]  Show the HTTP method beside each link.
 * @returns A Starlight sidebar entry: a group of tags when the document has
 *   operations, or a plain link to the reference when it does not. The shape is
 *   left to inference so it satisfies Starlight's sidebar union — annotating it
 *   as `object` makes `astro.config.mjs` fail to type-check.
 */
export async function openApiSidebarGroup({
	spec,
	base,
	label = 'API reference',
	collapsed = true,
	badges = true,
}) {
	/** Shown when there is nothing to expand, so the reference stays reachable. */
	const fallback = { label, link: base };

	let document;
	try {
		document = await loadDocument(spec);
	} catch (error) {
		warn(spec, error, 'The API reference is still linked, but without per-operation entries.');
		return fallback;
	}

	try {
		const navigation = createNavigation(DOCUMENT_NAME, document, {});
		const groups = [];

		for (const entry of navigation.children ?? []) {
			// Only tags become groups. `models`, and the `text` entries generated
			// from the spec's `info.description`, are reachable from the reference
			// itself and would bury the operations if listed here.
			if (entry.type !== 'tag') continue;

			const items = [];
			for (const child of walk(entry.children)) {
				if (!LINKABLE.has(child.type)) continue;

				const anchor = anchorFor(child.id);
				if (!anchor) continue;

				const item = { label: child.title ?? child.name, link: `${base}#${anchor}` };
				const variant = METHOD_VARIANT[String(child.method).toLowerCase()];
				if (badges && child.method) {
					item.badge = { text: String(child.method).toUpperCase(), variant: variant ?? 'default' };
				}
				items.push(item);
			}

			if (items.length) groups.push({ label: entry.title ?? entry.name, collapsed: true, items });
		}

		// A spec with no tags at all — or one whose operations Scalar placed
		// outside any tag — yields no groups. Link the reference plainly rather
		// than showing an empty expander.
		if (!groups.length) return fallback;

		return { label, collapsed, items: [{ label: 'Overview', link: base }, ...groups] };
	} catch (error) {
		warn(spec, error, 'The API reference is still linked, but without per-operation entries.');
		return fallback;
	}
}
