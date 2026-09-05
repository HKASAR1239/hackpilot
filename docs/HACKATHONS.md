# Research notes: from event rules to useful deliverables

These official event pages were reviewed during product design on September 5, 2026. All three events had ended and were used as case studies, without participation or submission.

| Event                                                                                                  | Organizer requirements identified during the review                                                                                                                     | Product implication                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [100 Agents, June 14–29, 2025](https://100agents.devpost.com/)                                         | An agent addressing a business problem, a public application, and a video up to three minutes. Judges do not run local code.                                            | Build a demonstrable workflow and prepare a presentation narrative. A source ZIP alone is insufficient for submission.                                                                                               |
| [Google Chrome Built-in AI Challenge, September–October 2025](https://googlechromeai2025.devpost.com/) | A new app or extension using Chrome's built-in AI APIs, a licensed public GitHub repository, an accessible app, a video under three minutes, and an English submission. | Read technical requirements, language, and deliverables before choosing an approach. AI-assisted coding does not establish use of a required product API.                                                            |
| [ETHGlobal New York, August 15–17, 2025](https://ethglobal.com/events/newyork2025)                     | Separate sponsor prizes. The LayerZero prize, for example, called for a deployed V2 contract, a public repository, transaction evidence, and a form.                    | Evaluate the specific prize requirements and retain technical evidence. A simulated integration does not satisfy a deployment requirement. See the [prize details](https://ethglobal.com/events/newyork2025/prizes). |

## Design conclusions

Our interpretation of these examples is that the assignment should determine the scope, and consequential claims should be connected to sources or execution evidence.

1. Read the brief, rules, and prize pages; retain citations and disagreements between sources.
2. Select a focused approach for a case study, or compare concepts when an event leaves the project open.
3. Produce the required documents and working prototype where appropriate, including important error states and persistence.
4. Check the resulting files or browser workflow, retain the evidence, and attempt corrections.
5. Package the response, source code, instructions, and verification results.
6. Identify outstanding integrations, hosting, video, eligibility, and submission requirements.

The [100 Agents rules](https://100agents.devpost.com/rules) weighted functionality, presentation, creativity, and viability equally at 25% each. During the review, the rules and homepage disagreed on some prizes and the announced results date. Such disagreements should remain explicit rather than be resolved by invention.

HackPilot's internal concept ranking is a feasibility heuristic, not an event's official judging score. These examples do not establish that any strategy guarantees a win.

## Current implementation and further work

HackPilot supports source review, planning, local document and prototype generation, format-specific checks, correction attempts, and export. Its [user guide](USER_GUIDE.md) describes the actual output limits.

Shared backends, verified sponsor integrations, deployment, video recording, and event submission would each need their own implementation and validation. They are not automated by the current release.
