# User guide

## Importing an assignment

You can start with a public URL, a written brief, uploaded documents, or a combination. Documents alone are enough to create a project. Public URL imports read the initial page and up to three relevant linked pages, such as rules, resources, announcements, or prizes. Inaccessible or ambiguous sources are reported instead of reconstructed.

The **Slides and documents** section accepts:

| Input       | Behavior                                                             |
| ----------- | -------------------------------------------------------------------- |
| PDF         | Extracts the text layer; uses local OCR on pages without usable text |
| PPTX        | Reads slide text and tables in presentation order                    |
| PNG or JPEG | Uses local French / English OCR                                      |

- Up to three files, 10 MiB each, and 80 pages per document.
- Up to 40,000 extracted characters per document; truncation is reported.
- Images are limited to 16 million pixels.
- Legacy `.ppt` files must be converted to PPTX or PDF first.

Each extracted page becomes a source with the filename, page number, and document fingerprint. Inspect the extracted text before starting, especially for scans. OCR can misread text and does not interpret diagrams.

PowerPoint speaker notes, charts, and text inside images are not interpreted. Supply a PDF or readable screenshots when those contain important information. For PDFs with a text layer, OCR does not automatically recover every embedded visual element.

## Language and examples

The **Français / English** selector changes the interface and is remembered in the current browser. New Codex projects use the selected output language. Existing projects and uploaded content retain their original text.

**Donation coordination** selects a fixed French demo. It needs no model login and tests the complete local prototype workflow. Changing its brief does not turn it into an arbitrary generator. **Case study · 1 hour** is a real generation preset that requests a profitability analysis, four PowerPoint slides, and an Excel model.

Historical hackathon examples are simulations. The [research notes](HACKATHONS.md) describe the events used during product design.

## Choosing deliverables

Required formats and explicit restrictions come first. When the brief permits it, the planner may add a website, simulator, or another useful complement and explains why it fits the subject and time budget. A case study gets one focused approach; up to three concepts are compared only when the assignment leaves the choice of project open.

Internal concept scores are planning heuristics, not jury scores or probabilities of winning. The engine assumes AI assistance is allowed when the supplied rules are silent, and retains explicit restrictions and disclosure obligations with their sources.

## Current format limits

| Format               | Supported scope                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Reports              | Structured written analysis, PDF and Markdown                                                                                        |
| Presentations        | Up to 30 slides using a text template, with notes and references; no custom visual identity, images, or charts                       |
| Spreadsheets         | Up to eight independent sheets of 200 rows, with label, value, unit, source, and assumption columns                                  |
| Spreadsheet formulas | Arithmetic and `SUM`, `AVERAGE`, `MIN`, `MAX` over column B of the same sheet; no cross-sheet references or advanced Excel functions |
| Web prototypes       | Static HTML, CSS, JavaScript, and browser storage; no deployed backend, shared accounts, or external connections in the preview      |

DOCX and video generation are outside the current scope. Missing integrations and unsupported deliverables should appear in the project's limitations.

Document checks reopen exported files and inspect structure and content. Spreadsheet formulas are evaluated by a bounded arithmetic parser without JavaScript execution. Web checks combine engine-defined browser checks with model-proposed interaction scenarios. The original web scenarios are retained during repairs. These checks and the model's content review are useful evidence, not an exhaustive audit or domain validation.

### Known dependency advisories

The dependency audit recorded on September 5, 2026 reported two high-severity entries involving `image-size` and its parent PptxGenJS package. HackPilot's presentation renderer sends text to PptxGenJS and does not call its image-import functions; uploaded images use the separate OCR pipeline. Address the affected dependency before adding image support to presentations. ExcelJS's UUID dependency is pinned to `11.1.1` through an override.

Run `npm audit` against your checkout to see the current advisory status. The recorded result should not be interpreted as a clean dependency audit.

## Data and execution

- Working files live in `.hackpilot/<mission-id>/`. The directory is ignored by Git.
- Original uploads are not retained. Extracted document drafts expire after 24 hours; source copies attached to a project remain with it.
- Extraction and OCR run locally with models installed as dependencies. Codex generation sends the brief, extracted text, and content being generated or reviewed through the configured provider connection.
- The API and preview servers bind to `127.0.0.1`. Preview pages use a separate port with a content policy that blocks external connections.
- Generated programs are not executed as shell commands. The engine writes validated static files and converts structured content into documents.
- Public source fetching rejects private addresses and redirects into private networks. File access is restricted to the project directory.

Do not put credentials in a brief. Project exports include source material and should be reviewed before sharing. Git ignores the default working directory; if you choose another data directory, keep it outside the repository or ignore it explicitly.

## Budgets and recovery

| Limit                                | Scope                              |
| ------------------------------------ | ---------------------------------- |
| One active project                   | Per server                         |
| 15 minutes                           | Per execution attempt              |
| Five minutes                         | Per Codex generation step          |
| Nine model calls                     | Per project                        |
| 300,000 input / 60,000 output tokens | Per project, checked between calls |
| Two repairs                          | Per project                        |

An individual call may cross a token threshold before the next check. Token limits are not a monetary cap; Codex account billing and usage limits still apply. The assignment's **available time** field guides project scope and does not change the engine's 15-minute attempt limit.

You can stop an active project. After a server restart, unfinished projects are marked interrupted. Resume uses saved work and the remaining project budget; it does not reset model usage or repair limits.

## Configuration

| Variable                 | Default                                              | Purpose                      |
| ------------------------ | ---------------------------------------------------- | ---------------------------- |
| `PORT`                   | `4317` in production, `4318` for the development API | API / production server port |
| `HACKPILOT_PREVIEW_PORT` | `4319`                                               | Isolated preview server port |
| `HACKPILOT_DATA_DIR`     | `.hackpilot` in the project directory                | Local working data           |
| `HACKPILOT_CODEX_BIN`    | Project-installed Codex                              | Alternative Codex executable |
| `HACKPILOT_MODEL`        | Model configured in Codex                            | Generation model override    |

The server does not load `.env` files automatically. Set variables in the launch environment. The development UI and its API proxy use the ports in `vite.config.ts`; changing the development API port also requires updating that proxy.

## Troubleshooting

**Codex is unavailable or its login has expired.** Run `npm ci`, then `npm run login`. The preset demo remains available without login. A provider error is displayed rather than silently replaced by a demo.

**Chromium cannot launch.** Run `npx playwright install chromium`. On Linux, install browser system dependencies with `npx playwright install --with-deps chromium`.

**A port is already in use.** Stop an existing HackPilot process before switching between `npm start` and `npm run dev`. Production and development both use port `4317` for the UI and `4319` for previews.

**The UI is missing in production.** Run `npm run build` before `npm start`.

**Document text is incomplete.** Check extraction warnings and the page limit. Convert old PowerPoint files, improve scan resolution, or add a readable PDF or screenshot. Review the extracted text before generating.

**A website asks for login or cannot be read.** Paste the relevant assignment text or upload the organizer's documents. Only public source pages are fetched.

**A live case-study UI check cannot find a project.** Run `node scripts/live-case.mjs` first, then `node scripts/case-ui.mjs` against the same server and data directory. The first command uses your Codex account and records the project ID under `validation/`.
