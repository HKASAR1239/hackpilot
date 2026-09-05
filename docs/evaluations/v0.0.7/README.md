# v0.0.7 development evaluation

These real-model development runs use fictional assignments, a 30-minute deadline per arm, and `gpt-6-astra`. They establish neither a win probability nor general superiority over a strong single prompt. The [protocol](../../EVALUATION.md) describes the fixed-plan comparison and its limits.

## What was compared

Both arms receive the same brief, source text, fixed plan, output contracts and document exporter. The single-prompt baseline includes explicit self-check and revision instructions and requests xhigh effort. The pipeline has additional calls for a shared reference, production, checks, reviews and optional contribution trials. Later pipeline runs use high effort throughout short projects; early runs use xhigh for reference preparation and reviews.

This was iterative development: defects were fixed between batches, and selected cases were rerun. Initial failures remain in [results.json](results.json). Do not pool the batches as a controlled experiment or infer a success rate for unseen assignments. Engine hashes were introduced partway through the exercise; null means the earlier source hash was not recorded. Runtime diagnostics and full raw generations remain local.

## Reading the evidence

- **Completion** means the required files passed the recorded checks. It does not establish a good operational idea or successful field use.
- **Usage** is provider-reported input/output tokens. Interrupted calls can consume usage that is not reported. A zero is not evidence that a timed-out call was free.
- **Jury assessments** belong to the pipeline. They are not independent benchmark grades.
- **Content inspection below** is an internal, retrospective review by the development assistant, which had seen run diagnostics and outputs. It is not a blinded human evaluation. The harness also exports randomized pairs for later independent assessment.

## All attempts

Times include failed calls and optional trials. Each arm had a 30-minute project deadline; an individual call can stop earlier under its allocated time allowance.

| Batch              | Assignment              | Strong single prompt                                     | Pipeline                                                                 |
| ------------------ | ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| Initial            | Vague brief             | Completed: 83 s, 1 call                                  | Completed: 345 s, 6 calls                                                |
| Initial            | Museum, weighted rubric | Export failed: 223 s, 1 call; slide density              | Failed: 13 s, 1 call; criterion ID validation                            |
| Initial            | Equipment web prototype | Failed: 1,440 s, 1 call; timeout after transport retries | Failed: 629 s, 4 calls; web generation timeout                           |
| Rubric recheck     | Museum                  | Export failed: 249 s, 1 call; slide density              | Failed: 216 s, 2 calls; reference preparation timeout                    |
| Revised allocation | Vague brief             | Completed: 97 s, 1 call                                  | Completed: 520 s, 13 calls                                               |
| Revised allocation | Museum                  | Export failed: 284 s, 1 call; slide density              | Completed: 958 s, 14 calls                                               |
| Final web recheck  | Equipment web prototype | Not rerun                                                | Failed: 784 s, 4 calls; web generation exceeded its 657-second allowance |

The web case did not produce a usable prototype in these attempts, so its independently authored browser scenario could not run. Increasing the allocation did not establish reliable web delivery. This remains a real limitation, even though deterministic browser fixtures pass. The baseline had recorded transport disconnections; the pipeline timeouts alone do not identify their underlying cause.

## Brief with little detail

The final comparison produced a short equipment-sharing recommendation in both arms. The [single-prompt result](vague-baseline.md) took 97 seconds and one call; the [pipeline result](vague-pipeline.md) took 520 seconds and 13 calls. Recorded usage was 18,509 input / 2,262 output tokens for the baseline and 257,697 input / 12,679 output tokens for the pipeline.

The baseline gives a concrete learning rule: record five initial attempts, count clarification messages and unsuccessful requests, and treat too few trial attempts as inconclusive. Its two-week duration is explicitly proposed rather than presented as observed. The pipeline provides a more detailed physical checkout routine, including uncertain inventory states, borrower-data removal, and a safe withdrawal procedure. It leaves observation comparability and continuation more subjective. Both distinguish assumptions from supplied facts and avoid claiming measured gains.

There is no clear overall quality advantage here. The baseline is substantially cheaper and faster. A pipeline suggestion tried to make observation more consistent, but the final A/B comparison found that additional detail and irrelevant revision caveats offset the benefit. The engine restored its checked baseline. That supports the rollback mechanism; it does not justify the extra calls as a quality gain.

## Detailed brief with a weighted rubric

The last museum pipeline run produced a [recommendation](museum-memo.md) and [three-slide proposal with notes](museum-pitch.md), exported as five files. It used 330,001 input / 26,557 output tokens and 14 calls in 958 seconds. The final single prompt used 18,640 input / 7,081 output tokens and one call in 284 seconds, but the common exporter rejected its slide density. That is an export-readiness difference, not proof of better operational judgment.

The pipeline retains the 40/35/25 judging weights and assesses all three criteria. Its initial slide-density error was repaired. A later trial tried to clarify who would collect observations, but its slide output failed validation and exhausted the second repair allowance. The checked first version was restored, retaining the operational gap instead of claiming it had been resolved.

The retained proposal compares signage with an optional welcome, allocates the two staff, keeps a shared accessible route and defines prospective observation and stop rules. Its measurement workload remains questionable for two staff already serving visitors. The three exported PDF slides were visually inspected and were legible without clipped text; their design is a basic text template. Neither visitor benefit nor staffing feasibility was field-tested.

## Defects found and addressed

- Source-backed criterion IDs containing underscores were incorrectly rejected. The validator now accepts ordinary ASCII identifiers and retains exact quote and weight checks.
- Early per-call allocations stopped reference preparation and web generation before the project deadline. Phase allocation now gives preparation more time, takes unfinished deliverables into account, and requests high effort for short projects. Time estimates still cannot guarantee a completed response.
- Early timeout messages incorrectly said 30 minutes when a shorter dynamic allowance applied. Diagnostics and UI now show the actual allowance.
- A content review could finish after an initial snapshot without its assessment entering a subsequent snapshot. Saved versions now preserve their own available assessment and metadata.
- The first vague result and a later trial exposed irrelevant generation/revision context in deliverables. Production instructions now separate the answer-preparation deadline from a proposed field experiment. The final comparison still rejects an unhelpful revision rather than promoting every change.

## Engineering validation

The release has 62 passing engine/API regression tests. Browser checks cover workspace recovery, quality evidence, adaptive controls, two-tab contribution drafts, storage quota failure, both languages, mobile width and checked exports. The isolated demo completes 13 end-to-end checks. Lint, TypeScript and production build pass.

These fixtures verify recovery and validation behavior. Further evaluation should use held-out topics, repeated runs, independent reviewers, end-to-end planning and comparable compute budgets. Long project deadlines are supported through resumable milestones; unattended multi-week field work was not tested or implemented.
