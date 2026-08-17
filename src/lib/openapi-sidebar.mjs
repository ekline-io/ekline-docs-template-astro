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

/** Depth-first walk over the navigation tree. */
function* walk(entries) {
	for (const entry of entries ?? []) {
		yield entry;
		yield* walk(entry.children);
	}
}

/** Turn a Scalar navigation ID into the in-page anchor for `base`. */
function hrefFor(base, id) {
	const hash = String(id).slice(DOCUMENT_NAME.length + 1);
	return `${base}#${hash}`;
}

/**
 * Read and fully resolve an OpenAPI document.
 *
 * `normalize` accepts YAML or JSON, `upgrade` lifts Swagger 2.0 and OpenAPI 3.0
 * documents to 3.1, and `dereference` resolves `$ref`s — so a customer's spec
 * works whatever shape it arrives in.
 */
async function loadDocument(specPath) {
	const raw = await readFile(specPath, 'utf-8');
	const { specification } = upgrade(normalize(raw));
	// `dereference` is synchronous despite the name — no `await` here.
	const { schema } = dereference(specification);
	return schema ?? specification;
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
	} catch {
		// `openApiSidebarGroup` warns about the same document on the same build;
		// repeating it here would just double every message.
		return [];
	}

	try {
		const navigation = createNavigation(DOCUMENT_NAME, document, {});
		const operations = [];

		for (const tag of navigation.children ?? []) {
			if (tag.type !== 'tag') continue;

			for (const child of walk(tag.children)) {
				if (!LINKABLE.has(child.type)) continue;
				operations.push({
					title: child.title ?? child.name,
					method: child.method ? String(child.method).toUpperCase() : '',
					/** Anchor within the reference, without the leading `#`. */
					anchor: String(child.id).slice(DOCUMENT_NAME.length + 1),
					tag: tag.title ?? tag.name,
					isWebhook: child.type === 'webhook',
				});
			}
		}

		return operations;
	} catch {
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
		console.warn(
			`[openapi-sidebar] Could not read "${spec}": ${error.message}\n` +
				`  The API reference is still linked, but without per-operation entries.`
		);
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

				const item = { label: child.title ?? child.name, link: hrefFor(base, child.id) };
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
		console.warn(
			`[openapi-sidebar] Could not build sidebar entries from "${spec}": ${error.message}\n` +
				`  The API reference is still linked, but without per-operation entries.`
		);
		return fallback;
	}
}
