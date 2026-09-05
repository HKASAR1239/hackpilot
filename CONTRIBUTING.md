# Contributing to HackPilot

Issues and pull requests are welcome. For bugs, include the steps to reproduce, your Node.js version, the expected result, and the observed result. Use a synthetic brief when the original contains private information.

## Local setup

Use Node.js 22.13 or later.

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open [127.0.0.1:4317](http://127.0.0.1:4317). The API uses port `4318` during development; previews use port `4319`. Stop a production instance before starting the development server.

The preset demo and engine tests do not need a model login. For real generation, authenticate with `npm run login`.

## Checks

Before submitting a change:

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
```

For user-facing workflow changes, build the app and run the isolated checks:

```sh
npm run test:e2e
node scripts/workspace-ui.mjs
node scripts/quality-ui.mjs
node scripts/adaptive-ui.mjs
```

Run the browser workflows sequentially. These commands start their own servers on randomly allocated ports and use temporary project storage. They cover the demo, reloads during generation, draft and upload persistence, restored tabs and files, temporary API failures, quality evidence and adaptive controls. Screenshots and summaries go under `validation/`; these checks do not call a model. The additional document-upload check, `node scripts/test-documents-ui.mjs`, requires a running app: point `HACKPILOT_URL` at a separate test instance with its own `HACKPILOT_DATA_DIR`.

Real-model checks are **opt-in** and consume the configured Codex account:

```sh
npm run test:live
node scripts/live-case.mjs
node scripts/case-ui.mjs
```

The final command reads the case-study project recorded by the previous command. State which checks you ran in your pull request and distinguish model-backed runs from fixture-based tests.

## Project conventions

- Preserve required deliverables and cite the assignment when recording constraints. Useful additions should be justified in the plan.
- Keep demo data, generated results, and observed evidence distinct. Do not mark a missing or failed check as passed.
- Preserve original web test scenarios during repairs.
- Keep English and French interface messages aligned in `lib/en.json` and the UI.
- Document changes to execution capabilities, network access, data handling, and supported output formats.
- Keep `.hackpilot/`, `validation/`, credentials, private mission exports, and browser profiles out of commits. The default working directories are already ignored.

Use `npm run format -- <changed-files>` to format files you edit. Keep pull requests focused and explain the user-visible behavior, relevant checks, and remaining limitations.

## Publishing versions

Increment the patch version when publishing an updated README together with new or updated project files. Keep the README, `package.json`, both root version fields in `package-lock.json`, and the API health version in sync. Capture README screenshots from the current interface in English, using synthetic examples. Record user-visible changes in `CHANGELOG.md`.

The project is distributed under the [MIT license](LICENSE).
