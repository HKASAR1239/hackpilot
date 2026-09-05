# Adaptive workflow

New projects created with v0.0.7 use workflow version 2. Existing projects keep their saved generation contract and original execution policy; opening them does not add a new jury, deadline or contribution workflow.

## Judging contract

The engine extracts criteria directly from supplied sources in a separate call. Each official criterion needs an exact source quotation. A numeric weight also needs an overlapping source quotation containing that number. The source-backed rubric is stored with an integrity hash and kept separate from editable internal acceptance checks. Missing weights stay missing. If no official grid is extracted, four explicitly internal criteria cover relevance, correctness, evidence and communication.

When the plan has multiple approaches, a separate comparison receives their descriptions without the planner's scores or reasons. Every option must address every criterion. Selection uses the supplied weights only when all weights are available and no rubric uncertainty is recorded. Otherwise it uses an explicitly internal unweighted estimate. Scores are model estimates, not official grades or win probabilities. All extracted criteria are enforced by schema validation; extraction itself remains fallible.

The producer receives the rubric as well as the shared reference. The final jury call receives source material, deliverables, exported-file paths and actual test results. It does not receive the internal recommendation, the planner's scores, the reference dossier or previous reviews. Every criterion receives a status, concrete evidence and any remaining gap. Evidence paths must exist in the exported file list. Missing evidence cannot become a claimed test result.

Content review and judging have different purposes. Required internal checks protect correctness and requested outputs. A partial subjective jury assessment is visible and can suggest an improvement; it does not start an unlimited repair loop or establish actual competition readiness.

## Time and checkpoints

The project deadline is created once. New projects accept 0.5–720 hours and a separate cumulative call budget of 8–72 (24 by default). Token limits remain separate. Resuming does not reset any of these values.

A session runs until the deadline or a two-hour milestone, whichever comes first. Each model call is allocated a share of remaining session time based on the phase and unfinished deliverables. Reference preparation receives a larger share than extraction or capability review. For deadlines of an hour or less, requested xhigh/max calls use high effort; the actual setting is recorded per call. A reserve is kept for checks, and optional trials need enough estimated time and calls for both production and evaluation. These estimates cannot guarantee that a model will finish on time.

Each checked deliverable can create an immutable file snapshot. A complete checked version includes all planned outputs; its recorded assessment is included when available. The checked-version ZIP contains its own metadata rather than mixing in a later run's submission or review. This snapshot remains downloadable after a failed repair or an expired deadline.

Longer projects can resume between milestones. This release does not include a background scheduler, automatic interview recruitment or multi-week experiment execution. The deadline can be deliberately extended between runs, with the change recorded. Budgets and the actual evidence available still bound the result.

## Contributions

The local workspace accepts ideas, reported observations or source excerpts, factual corrections and new constraints. Request IDs make retries idempotent. Drafts survive page reloads; accepted input is persisted by the server even while a model call is running.

After a checked first version exists, the engine evaluates up to three queued contributions at a checkpoint. Input received after that queue snapshot stays queued and can be processed on resume. There is a maximum of 40 contributions and two trials per project. These bounds prevent a stream of suggestions from consuming the delivery budget. Hosted accounts, cross-device synchronization and remote team access are not included.

Proposal assessment hides author names and randomizes the position of the proposal and the existing scope. Both use the same rubric. The reviewer must state evidence, uncertainty, affected outputs, integration instructions and estimated time including tests. A missing fact is not upgraded into a verified fact simply because a teammate supplied it. A change requiring a replacement plan or new output formats is deferred in this release.

High- and medium-impact ideas from the jury enter the same contribution mechanism as team suggestions. Neither origin receives a privileged automatic integration path.

## Trial and promotion

Before a trial, the engine persists the baseline state and copies its files into a separate recovery directory. The original rubric and browser scenarios remain fixed. A revised reference is generated with the selected contribution. If shared facts, assumptions, calculations or recommendations change, all dependent deliverables are regenerated conservatively; otherwise the stated targets are repaired.

The candidate must pass executable checks and content review. A separate comparison sees the two actual bundles and their checks in randomized A/B order, without author names or the trial's motivation. Relevant reported factual evidence remains available to judge both versions. Only a supported preference for the candidate promotes it. A tie, low confidence, a failed check, a rejected output or an interruption restores the baseline. Consumed calls and repair attempts remain counted.

Interrupted trial metadata is recovered on restart before production continues. The contribution is queued again; unchanged checked work remains available. Decisions, failed trials and remaining uncertainties stay in the contribution history and normal project export.

Separate sessions and blinded comparisons reduce some sources of anchoring. They do not make the model unbiased: the same model can share blind spots across calls. The evaluation protocol in [EVALUATION.md](EVALUATION.md) compares final work against a strong single prompt and reports failures, time and usage separately from the model's own assessments.
