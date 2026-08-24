/**
 * Resolves the directory a build's static files actually landed in.
 *
 * Astro moves that directory depending on the adapter: a plain static build
 * fills `dist/`, the Node adapter splits its output into `dist/client/` (the
 * static files) and `dist/server/` (the request handler), and the Vercel
 * adapter writes `.vercel/output/static/` instead. The suites here read the
 * build off disk, so hardcoding one of those ties them to a single deployment
 * target — and the template picks its adapter at build time from the
 * environment.
 *
 * Probing for `index.html` rather than for the directory itself is what makes
 * the answer trustworthy. `dist/` exists under the Node adapter too, as the
 * parent of `client/` and `server/`, and a `dist/` left behind by an earlier
 * static build survives a Vercel-adapter build, which writes somewhere else
 * entirely. A bare directory check would happily return either.
 *
 * The candidate order fixes the case it can — `dist/` last, so a leftover
 * static build never shadows an adapter build — but not the case where one
 * machine has produced both adapter outputs: a stale `dist/client/` does
 * shadow a fresh `.vercel/output/static/`. Nothing in the normal flow builds
 * both (Vercel runners set `VERCEL=1` and start from a clean checkout;
 * everything local uses the Node adapter), so switching adapters in place is
 * the one case that calls for deleting the old output first.
 *
 * Throwing beats falling back to a guess. The alternative is every assertion in
 * the suite failing on a missing file, which reads as a broken site rather than
 * as a missing build.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const CANDIDATES = ['dist/client', '.vercel/output/static', 'dist'];

export function staticDir(projectRoot) {
	for (const candidate of CANDIDATES) {
		const dir = join(projectRoot, candidate);
		if (existsSync(join(dir, 'index.html'))) return dir;
	}
	throw new Error(
		`No static build output found under ${projectRoot} ` +
			`(checked: ${CANDIDATES.join(', ')}). Run \`npm run build\` first — ` +
			`or, if it did run, check that it emits an \`index.html\` at the root ` +
			`(a \`base\` path moves it).`
	);
}
