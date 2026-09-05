# Changelog

## 0.0.5 — 2026-09-05

- Use xhigh reasoning by default throughout planning, production, review, and repairs.
- Add a reasoning effort override and record requested generation settings in each attempt's activity log.
- Expose requested model and reasoning settings in the health endpoint.

## 0.0.4 — 2026-09-05

- Extend execution attempts and Codex step timeouts to two hours, with a shared overall deadline.
- Update the interface and API limits to match the execution budget.
- Preserve saved plans and model usage when resuming a timed-out project.

## 0.0.3 — 2026-09-05

- Restore the open project, selected tab, and source reader after a page reload.
- Reconnect to active generation without starting a duplicate run.
- Keep saved navigation intact when the local API is temporarily unavailable and offer retry.
- Add local project URLs and an isolated browser regression check for workspace recovery.

## 0.0.2 — 2026-09-05

- Simplified project setup with a compact form and collapsible generation settings.
- Added persistent browser drafts, clear/undo, and expired-upload notices.
- Added project search and a collapsible mobile project list.
- Made completed projects open on results, with direct document downloads and a collapsible source reader.
- Added current-step descriptions, elapsed time, and a shortcut back to an active run.
- Replaced the README screenshot with the current English interface and aligned version metadata.

## 0.0.1 — 2026-09-05

- First public MIT-licensed release of HackPilot for hackathons and case studies.
- English and French interface, document import, local generation, verification, and project export.

first project using Astra :)
