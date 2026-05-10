---
title: Changelog
description: Notable changes to the product, newest first.
---

A running list of notable changes. Group by date (newest at the top) and use
**Added / Changed / Fixed / Removed** subheadings so readers can skim quickly.

## 2026-05-10

### Added

- New `widgets` endpoint group. See **[API reference](/api/)**.
- Per-key scopes for finer-grained access control.

### Changed

- Error responses now include a `request_id` to make support faster.

## 2026-04-22

### Fixed

- Pagination cursors are no longer invalidated when a widget is deleted mid-page.

## 2026-04-01

- Initial public release.
