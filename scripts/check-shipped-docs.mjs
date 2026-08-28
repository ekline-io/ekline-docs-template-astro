#!/usr/bin/env node
/**
 * Guards the seam between this monorepo and the directory a customer receives.
 *
 * `packages/template/` is delivered by a directory copy, so any prose in it that
 * describes the monorepo — a sibling under `apps/`, a workflow under `.github/` —
 * is describing something the reader does not have. That drift is invisible here,
 * because in this repo those paths all resolve. It only surfaces in a customer's
 * copy, where nothing fails loudly.
 *
 * Two checks, both run against a simulated extraction:
 *
 *   1. Every relative link in shipped markdown still resolves once the files
 *      create-astro strips are gone.
 *   2. No shipped doc refers to a monorepo-only path as if the reader had it.
 *
 * Deliberately NOT checked: whether shipped prose is written for the customer
 * rather than the maintainer. "This directory is EkLine's template, which we ship
 * to customers" is wrong in a customer's repo but perfectly well-formed, so no
 * static check catches it. That one stays a review question.
 *
 * Usage: node scripts/check-shipped-docs.mjs
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPED_ROOT = join(REPO_ROOT, 'packages/template');

/**
 * create-astro deletes these from a fetched template (FILES_TO_REMOVE in
 * create-astro/dist/index.js). A link pointing at one of them resolves here and
 * 404s for the customer, so the simulated extraction has to drop them too.
 */
const REMOVED_ON_EXTRACT = new Set(['CHANGELOG.md', '.codesandbox']);

/** Never walked: build output, dependencies, generated types. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', '.vercel', 'test-results', 'playwright-report']);

/**
 * Paths that belong to the monorepo and never to a customer's copy. Matched only
 * against things the prose presents *as paths* — inline code spans and relative
 * link targets — so a full https link to a workflow on GitHub is left alone. That
 * describes this repo from the outside, which is what a customer's docs should do.
 *
 * `packages/` is deliberately absent. Shipped docs name `packages/template/`
 * legitimately and often: it is the tail of the adoption command, and the README
 * has to explain what that command fetches. Flagging it would fire on correct
 * prose in every release, and a check that cries wolf stops being read. `apps/`
 * and `.github/` have no such honest use from inside a customer's copy.
 */
const MONOREPO_ONLY = /^(apps|\.github)\//;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.git')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (/\.mdx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** True if the path would be absent from a freshly extracted copy. */
function strippedOnExtract(pathFromShippedRoot) {
  return pathFromShippedRoot.split('/').some((segment) => REMOVED_ON_EXTRACT.has(segment));
}

const violations = [];

function report(file, line, message, detail) {
  violations.push({ file: relative(REPO_ROOT, file), line, message, detail });
}

for (const file of walk(SHIPPED_ROOT)) {
  const shippedPath = relative(SHIPPED_ROOT, file);
  if (strippedOnExtract(shippedPath)) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  let inFence = false;

  lines.forEach((text, index) => {
    const lineNo = index + 1;

    // Track fenced blocks so shell commands inside them are not read as paths.
    if (/^\s*(```|~~~)/.test(text)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    // --- check 2: monorepo-only paths presented as paths ---
    for (const [, span] of text.matchAll(/`([^`\n]+)`/g)) {
      if (MONOREPO_ONLY.test(span.trim())) {
        report(file, lineNo, 'refers to a monorepo-only path', span.trim());
      }
    }

    // --- check 1 + 2: markdown link targets ---
    for (const [, rawTarget] of text.matchAll(/\]\(([^)\s]+)/g)) {
      const target = rawTarget.split('#')[0];
      if (!target) continue;
      if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue; // http:, mailto:, //
      // Site-absolute routes (`/api/`, `/get-started/quickstart/`) are URLs on the
      // built site, not files on disk. Astro resolves them; this check must not
      // try to, or every cross-link in the example content reads as broken.
      if (target.startsWith('/')) continue;

      if (MONOREPO_ONLY.test(target)) {
        report(file, lineNo, 'links to a monorepo-only path', target);
        continue;
      }

      const resolved = resolve(dirname(file), target);
      const withinShipped = relative(SHIPPED_ROOT, resolved);

      if (withinShipped.startsWith('..')) {
        report(file, lineNo, 'links outside the shipped directory', target);
      } else if (strippedOnExtract(withinShipped)) {
        report(file, lineNo, 'links to a file create-astro strips on extract', target);
      } else if (!existsSync(resolved)) {
        report(file, lineNo, 'links to a file that does not exist', target);
      } else if (statSync(resolved).isDirectory() && !existsSync(join(resolved, 'README.md'))) {
        report(file, lineNo, 'links to a directory with no README.md', target);
      }
    }
  });
}

if (violations.length === 0) {
  console.log('shipped docs OK — links resolve after extraction, no monorepo-only paths');
  process.exit(0);
}

console.error(`\n${violations.length} problem(s) in what ships to customers:\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.message}: ${v.detail}\n`);
}
console.error('These resolve in this repo and break in a customer copy. See scripts/check-shipped-docs.mjs.\n');
process.exit(1);
