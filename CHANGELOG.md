# Changelog

## v0.0.11

- Add executable direct-file browser scenarios when verification requires opening exported HTML without a server. External requests and files outside the exported folder are blocked.
- Preserve these scenarios, execution evidence and browser limitations in saved projects and exports.


## v0.0.10

- Correct stale supplemental message assertions after a content repair without changing original tests or reversing the content fix.

- Prevent calculation-check replacements from silently dropping previous assertions. Split checks must cover the same corrected inputs and worksheet.
- Support up to twenty output assertions per calculation scenario.
- Retry invalid verification proposals within the existing verification budget, preserve rejection diagnostics, and keep original files unchanged.
- Detect missing assertion coverage in saved recovery histories before final review.


## 0.0.6 — 2026-09-05

- Add a shared reference with alternatives, source quotations, explicit assumptions, evaluated calculations, and acceptance criteria.
- Check proposed quality criteria against actual format capabilities before production, retaining the original criteria and corrections for inspection.
- Produce, export, and check deliverables separately; preserve checked files and resume only unfinished work.
- Execute declared changed-input checks on formulas read from exported spreadsheets and retain the actual cell evidence.
- Review all criteria and cross-deliverable consistency, with targeted repairs and preserved original browser scenarios.
- Use xhigh for strategy/reference/review and high for production/repairs, with separate configuration overrides.
- Preserve redacted per-call telemetry and errors through cancellation. Bound each call to 30 minutes within the two-hour attempt.
- Allow 24 calls, 600,000 reported input tokens and 180,000 reported output tokens per project; retain budgets on resume.
- Show saved progress, decisions, evidence, and call diagnostics in the bilingual interface and project exports.
- Add recovery/diagnostic regressions and a reproducible comparison against a strong one-prompt baseline on synthetic briefs.

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
