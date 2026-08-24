# CLAUDE.md — apps/docs

Guidance for Claude Code working in this directory. The repo-wide file is at
[`../../CLAUDE.md`](../../CLAUDE.md); the template's own is at
[`../../packages/template/CLAUDE.md`](../../packages/template/CLAUDE.md).

## What this is

The hosted documentation for the template in `packages/template/`, written for
**customers using the template** — not for maintainers of it. Maintainer-facing
material lives in `packages/template/wiki/` and is rendered here as the
*Internals* section.

## The rule that matters most

**Every factual claim here must be checked against `packages/template/` as it
actually is.** This is the product for customers who will never read the
source. A wrong path, a stale option name, or a config sample that does not
work is a defect, not a typo. Open the file, run the command, confirm the
option exists. If the template's behaviour differs from what a doc says, the
template is right — fix the doc.

## Structure

- It is the template minus the logged-in experience and the API reference. Keep
  it that way: this site is public docs and hosts no API of its own.
- Built static — no adapter, no server bundle. A `dist/server/` in the output
  means something pulled an adapter back in.
- `src/loaders/wiki.mjs` reads `../../packages/template/wiki` from **outside**
  this app's root, on purpose. Do not "fix" it into a copy step: one copy of
  those files, beside the code they describe, is the whole design.
- Independent project — its own `package.json` and its own committed
  `package-lock.json`. There is no npm workspace in this repo, deliberately;
  see the root `CLAUDE.md` for why, and do not add one.

## Before changing anything

Consult the Starlight docs — <https://starlight.astro.build/> — rather than
relying on training data. That rule is repo-wide and applies here too.
