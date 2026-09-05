// Public synthetic assignments. They contain no customer or user project data.
const deliverable = (id, kind, title, count = null) => ({
  id,
  kind,
  title,
  count,
  sourceId: 'S1',
  quote: 'Required outputs',
  reason: 'Explicitly requested in the synthetic assignment.',
});
const makePlan = (id, brief, deliverables) => ({
  name: id,
  summary: brief,
  criteria: [],
  unknowns: [],
  requirements: [
    {
      id: 'R1',
      kind: 'mandatory',
      text: 'Answer the assignment and disclose unsupported assumptions.',
      sourceId: 'S1',
      quote: 'Required outputs',
    },
  ],
  deliverables,
  ideas: [
    {
      id: 'response',
      title: 'Respond to the assignment',
      concept:
        'Produce the requested outputs with a supported recommendation and usable evidence.',
      audience: 'Assignment evaluator',
      features: ['Answer the decision', 'Show evidence', 'State limitations'],
      fit: 5,
      feasibility: 5,
      originality: 3,
      reason: 'A fixed plan is shared by both evaluation arms.',
      risks: [],
    },
  ],
});
const shuttle =
  'A fictional campus is evaluating a shuttle. Monthly fixed cost is EUR 2500, fare is EUR 14 per ride, variable cost is EUR 4 per ride, and maximum monthly capacity is 200 rides. Evaluate demand scenarios of 100, 150, and 200 rides. Required outputs: a concise decision memo (PDF/Markdown) and an Excel model with editable inputs and formulas. Explicitly decide whether full capacity can cover costs. Do not treat theoretical break-even volume as feasible or claim demand is validated. In the spreadsheet, name the key rows exactly "Break-even rides" and "Result at capacity" so an external evaluator can identify them. No web prototype is requested.';
const museum =
  'A fictional museum has one entrance and two arrival staff. Visitors report confusion between prebooked entry, walk-in ticketing, and accessibility assistance. No queue counts, service times, budget or conversion data are available. Required outputs: a concise operational recommendation (PDF/Markdown) and exactly three PowerPoint slides. Focus on the physical arrival experience, propose a low-cost reversible pilot, compare it with a simple signage-only option, allocate staff responsibilities, address accessibility without segregation, define observable success and stop criteria, and separate assumptions from facts. Do not invent measured gains or require a new app. The fictional judging rubric is: visitor experience 40%, operational feasibility 35%, clarity of evidence 25%.';
const vague =
  'A fictional university club wants sharing equipment to feel easier. The assignment is intentionally open-ended. Required outputs: a short recommendation. Choose a useful starting point, state what is unknown and propose a reversible way to learn whether it helps. There are no interview results, budget figures or official judging criteria.';
const equipment =
  'Create a local web tool for a student team lending camera equipment. Required outputs: an interactive web prototype with persistent browser storage. Users add a named item, reserve it for a borrower, and return it. Duplicate names are rejected with visible feedback, blank borrowers are rejected, and reserved items cannot be reserved twice. Data must survive reload. For external acceptance tests use data-testid attributes: item-name (input), add-item (button), borrower (input), reserve (button), return (button), inventory (container showing item name and borrower), feedback (feedback container). Keep a single selected-item workflow so these selectors are unique. No external services. Include a usable empty state and a mobile layout.';
export const evaluationCases = [
  {
    id: 'vague',
    brief: vague,
    plan: makePlan('Equipment sharing exploration', vague, [
      deliverable('memo', 'analysis', 'Starting recommendation'),
    ]),
  },
  {
    id: 'shuttle',
    brief: shuttle,
    plan: makePlan('Campus shuttle decision', shuttle, [
      deliverable('memo', 'analysis', 'Decision memo'),
      deliverable('model', 'spreadsheet', 'Operating model'),
    ]),
    expectedRows: { 'Break-even rides': 250, 'Result at capacity': -500 },
  },
  {
    id: 'museum',
    brief: museum,
    plan: makePlan('Museum arrival pilot', museum, [
      deliverable('memo', 'analysis', 'Operational recommendation'),
      deliverable('pitch', 'presentation', 'Pilot proposal', 3),
    ]),
  },
  {
    id: 'equipment',
    brief: equipment,
    plan: makePlan('Equipment lending', equipment, [
      deliverable('app', 'web', 'Lending prototype'),
    ]),
    externalTests: [
      {
        name: 'Externally authored loan and reload scenario',
        steps: [
          {
            action: 'fill',
            selector: '[data-testid="item-name"]',
            value: 'Camera 7',
          },
          { action: 'click', selector: '[data-testid="add-item"]', value: '' },
          {
            action: 'fill',
            selector: '[data-testid="borrower"]',
            value: 'Alex',
          },
          { action: 'click', selector: '[data-testid="reserve"]', value: '' },
          { action: 'reload', selector: '', value: '' },
          {
            action: 'assertText',
            selector: '[data-testid="inventory"]',
            value: 'Alex',
          },
          { action: 'click', selector: '[data-testid="return"]', value: '' },
          { action: 'reload', selector: '', value: '' },
          {
            action: 'assertText',
            selector: '[data-testid="inventory"]',
            value: 'Camera 7',
          },
        ],
      },
    ],
  },
];
