---
title: Reference overview
description: How the reference section is organized and where to find what you need.
---

This section is the **information-oriented** part of the docs. It aims to be
exhaustive and terse, not to teach. If you're new, start with
[Quickstart](/get-started/quickstart/) instead.

## What's in here

- **[API reference](/api/)** — every endpoint, parameter, and response field,
  generated automatically from the OpenAPI spec at `src/schemas/api.yaml`.
- **[Errors](/reference/errors/)** — the error codes you may see and how to react.
- **[Example reference page](/reference/example/)** — the original placeholder
  page; delete or repurpose it.

## Conventions

- Code samples assume `API_KEY` is set in your environment.
- All timestamps are ISO 8601 strings in UTC.
- IDs use a typed prefix (`wdg_`, `evt_`, …) followed by a 26-character ULID.

## Further reading

- Read [about reference](https://diataxis.fr/reference/) in the Diátaxis framework.
