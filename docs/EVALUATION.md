# Quality evaluation

HackPilot should earn its extra calls through better work, measurable checks, and reliable recovery. Multiple model calls alone are not evidence of quality.

The [v0.0.7 development results](evaluations/v0.0.7/README.md) include real calls, failures and reruns. They are an engineering evaluation, not evidence of a general quality advantage.

## Reproduce

Install the app, Chromium, and log in to Codex. Run:

```sh
HACKPILOT_MODEL=gpt-6-astra npm run eval:quality -- --live
```

Use `--case vague`, `--case shuttle`, `--case museum`, or `--case equipment` for one assignment (or comma-separated names), `--minutes 30` for a shared 30-minute deadline, and `--out /absolute/directory` for a different output location. These calls use your account. Running the command without `--live` prints usage without model calls.

## Comparison contract

Both arms receive identical synthetic source text, a fixed plan, and the same requested model. The baseline receives the complete production contract plus an explicit instruction to compare options, verify calculations and constraints, label assumptions, check consistency, and revise before responding. It is not deliberately weakened. The adaptive pipeline extracts a sourced rubric, preserves a calendar deadline, builds a shared reference, checks its criteria against supported format capabilities, generates individual outputs, checks them, and performs a separate content review and a jury assessment against every extracted criterion. Optional improvements go through controlled contribution trials.

Both use the same document exporter and mechanical checks. The baseline uses strategy effort (xhigh by default); pipeline production uses high and reference/review normally use xhigh. For adaptive deadlines of an hour or less, xhigh/max pipeline calls use high; the baseline retains xhigh and receives the full single-call allowance within its deadline. The pipeline is allowed more calls and tokens. Reported usage, time, and repair counts expose that tradeoff. Interrupted calls may consume tokens not reported by the provider; local usage is not a billing statement.

This protocol measures the workflow **after a plan is selected**. It does not measure the quality of planning, source discovery, or hackathon concept selection. Public fixtures contain no user case data.

## Assessing results

`report.json` records each arm's completion status, failures, mechanical results, external checks, time, and usage. The shuttle's independent oracle checks a break-even point of 250 rides and a loss of EUR 500 at its 200-ride capacity. The equipment scenario has a separately authored browser workflow. The museum case requires human judgment about the operational proposal; valid files and three slides do not establish a good visitor experience.

Each successful pair also writes a randomized `*-blind.json` and a separate `*-key.json`. Review the blinded pair before opening its key. Evaluate correctness and feasibility, coverage, evidence and assumptions, usability, and consistency. Cite concrete content. More pages or more words should not increase a score by themselves; ties are valid.

Use multiple seeds/runs and independent reviewers before claiming a general advantage. Include failure rates and cost/time, not just the best example. Report quality separately from the model's own review: it is part of the pipeline, not an independent benchmark judge.

## Regression evidence

`npm test` covers source-quote rejection, missing obligations, calculation errors, incomplete review evidence, checkpoint recovery after a fresh store loads, targeted slide repair, preserved spreadsheet bytes, retained repair budgets, original browser tests, diagnostics that survive cancellation, and changed-input checks that reject a formula frozen at an otherwise correct initial value. Missing verification evidence blocks completion without automatically consuming repair rounds. These tests use explicit fixtures and simulated failures to test engineering guarantees; they are not model-quality scores.

## Adaptive regression coverage

The adaptive suite checks source-bound weights, immutable criterion identity, weighted approach selection, complete jury coverage, absence of producer rationale in the jury prompt, persistent deadlines through restarts, deadline cancellation, idempotent contributions, anonymous A/B positions, trial promotion, tie retention, failure rollback, cancellation during a trial and preservation of the delivery reserve. Browser checks cover the control room, contribution drafts across reloads, submitting and resuming, snapshot ZIPs, explicit deadline changes, both interface languages and mobile width. These deterministic fixtures establish behavior, not superior model quality.
