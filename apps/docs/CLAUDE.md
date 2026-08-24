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

## Who these docs are for

Write for a named person, not "the user". Five read this site; each wants a
different thing, and most will only ever visit one section.

| Persona | Who they are | What they came for | Where they land |
| --- | --- | --- | --- |
| **Evaluator** | Dev or docs lead choosing a stack | "What do I get, what does it cost me, does it do X?" | Landing page. Short visit — answer fast or lose them. |
| **Adopter** | The developer setting it up | "How do I create it, brand it, and ship it?" | Get started, then Configure. **The primary persona.** |
| **Author** | Technical writer living in it daily | "Where do pages go? How do I add one to the nav? How do I preview?" | Writing content. Often *not* a developer — never assume a terminal is open. |
| **Integrator** | Backend or platform engineer | "What exactly must my product implement for sign-in?" | The logged-in experience, and nothing else. Wants a contract and a sample. |
| **Maintainer** | Whoever edits the template's guts later | "What will I break?" | Internals — the wiki. Already written for them; do not rewrite it here. |

The Author and Integrator are the two most often written past. The Author is
frequently not a developer — a page that opens with an adapter comparison has
already lost them. The Integrator needs one page and does not care about
theming.

## Voice and structure

**Each page does one job, in one mode.** Mixing modes is the most common docs
failure — a tutorial that detours into reference, a reference page that starts
explaining. The four modes, and which section owns each:

- **Tutorial** — Get started. A guaranteed path to a working result. No options,
  no alternatives, no "you could also".
- **How-to** — Configure, API reference, The logged-in experience. Achieves one
  goal for someone who already has the thing running. Assumes context.
- **Reference** — Reference. Dry, complete, scannable. Tables over prose.
- **Explanation** — Internals. Why it is built this way.

**Rules that make the difference:**

- Lead with the action. No preamble, no "In this guide we will".
- Show the code first, then explain it. The reader is scanning for the block
  they can copy.
- Second person, present tense, active voice. "Set `DOCS_SITE_URL`" — not
  "`DOCS_SITE_URL` should be set" or "we recommend setting".
- For every setting, say **what happens if you leave it alone.** That is the
  question readers actually have.
- Where a choice has a real trade-off, state the trade-off and recommend one.
  Do not present two options neutrally and leave the reader stuck.
- Where something is dangerous, say so plainly and early — the way
  `.env.example` does for `DOCS_UNSAFE_DEMO_LOGIN`.
- Link instead of repeating. One fact, one home.

**Cut ruthlessly.** Do not explain Markdown, npm, or what a sidebar is. Do not
document the reasoning behind the template's internals — that is what Internals
is for. Do not add a page because the outline has a gap; a section that is
honestly two pages is two pages. Length is not thoroughness.
