export const caseBrief =
  'Simulation d’étude de cas d’une heure. Une entreprise propose des ateliers à 120 EUR par participant. Le coût variable est de 45 EUR par participant et les coûts fixes mensuels sont de 18000 EUR. Capacité mensuelle : 300 participants. Évaluer les scénarios de 180, 240 et 300 participants, calculer le seuil de rentabilité et recommander ou non le lancement. Livrer une analyse écrite en PDF, exactement 4 slides PowerPoint et un tableur Excel avec formules. Distinguer les données fournies des hypothèses.';
export function casePlan() {
  return {
    name: 'Étude de cas — ateliers',
    summary:
      'Évaluer le seuil de rentabilité et les scénarios avant le lancement.',
    criteria: [],
    requirements: [],
    unknowns: [],
    deliverables: [
      ['analyse', 'analysis', 'Analyse du lancement', null],
      ['presentation', 'presentation', 'Recommandation', 4],
      ['calculs', 'spreadsheet', 'Modèle économique', null],
    ].map(([id, kind, title, count]) => ({
      id,
      kind,
      title,
      count,
      sourceId: 'S1',
      quote: 'Livrer une analyse écrite en PDF',
      reason: 'Livrable demandé dans l’énoncé.',
    })),
    ideas: [
      {
        id: 'evaluation',
        title: 'Décision de lancement',
        concept:
          'Comparer la marge et le résultat aux trois niveaux de fréquentation.',
        audience: 'Direction',
        features: ['Seuil de rentabilité', 'Scénarios', 'Recommandation'],
        fit: 5,
        feasibility: 5,
        originality: 3,
        reason: 'Répond aux questions imposées.',
        risks: [],
      },
    ],
  };
}
export function caseBundle() {
  return {
    files: [],
    tests: [],
    limitations: [
      'Les scénarios sont fournis par l’énoncé ; ils ne constituent pas une prévision de demande.',
    ],
    artifacts: [
      {
        id: 'analyse',
        title: 'Décision de lancement des ateliers',
        slides: [],
        sheets: [],
        sections: [
          {
            heading: 'Seuil de rentabilité',
            paragraphs: [
              'La marge unitaire est de 75 EUR (120 − 45). Les coûts fixes de 18 000 EUR sont couverts à partir de 240 participants par mois (18 000 / 75). Ce seuil représente 80 % de la capacité de 300 participants.',
            ],
            sourceIds: ['S1'],
          },
          {
            heading: 'Scénarios et recommandation',
            paragraphs: [
              'Le résultat mensuel est de −4 500 EUR à 180 participants, nul à 240 et de 4 500 EUR à 300. Conditionner le lancement à la validation d’une demande supérieure à 240 participants. La demande réelle n’est pas fournie dans l’énoncé.',
            ],
            sourceIds: ['S1'],
          },
        ],
      },
      {
        id: 'presentation',
        title: 'Décision de lancement',
        sections: [],
        sheets: [],
        slides: [
          {
            title: 'Économie des ateliers',
            bullets: [
              'Prix : 120 EUR par participant',
              'Coût variable : 45 EUR par participant',
              'Coûts fixes mensuels : 18 000 EUR',
            ],
            notes: 'Données fournies dans le cas.',
            sourceIds: ['S1'],
          },
          {
            title: 'Seuil de rentabilité : 240 participants',
            bullets: [
              'Marge unitaire : 75 EUR',
              '18 000 / 75 = 240 participants',
              '80 % de la capacité mensuelle',
            ],
            notes: 'Calculs issus des données de l’énoncé.',
            sourceIds: ['S1'],
          },
          {
            title: 'Trois scénarios de fréquentation',
            bullets: [
              '180 participants : −4 500 EUR',
              '240 participants : 0 EUR',
              '300 participants : +4 500 EUR',
            ],
            notes: 'Résultat = participants × 75 − 18 000.',
            sourceIds: ['S1'],
          },
          {
            title: 'Valider la demande avant le lancement',
            bullets: [
              'Viser plus de 240 participants par mois',
              'Mesurer les préinscriptions avant engagement',
              'La demande réelle reste inconnue',
            ],
            notes:
              'Recommandation conditionnelle : ne pas confondre scénarios et prévisions.',
            sourceIds: ['S1'],
          },
        ],
      },
      {
        id: 'calculs',
        title: 'Modèle économique des ateliers',
        sections: [],
        slides: [],
        sheets: [
          {
            name: 'Rentabilite',
            rows: [
              ['Prix', 120, '', 'EUR', 'S1', ''],
              ['Coût variable', 45, '', 'EUR', 'S1', ''],
              ['Coûts fixes', 18000, '', 'EUR', 'S1', ''],
              ['Capacité', 300, '', 'participants', 'S1', ''],
              [
                'Marge unitaire',
                null,
                'B2-B3',
                'EUR',
                '',
                'Prix moins coût variable',
              ],
              [
                'Seuil de rentabilité',
                null,
                'B4/B6',
                'participants',
                '',
                'Coûts fixes divisés par la marge',
              ],
              [
                'Taux de remplissage au seuil',
                null,
                'B7/B5',
                '%',
                '',
                'Seuil divisé par la capacité',
              ],
              ['Scénario bas', 180, '', 'participants', 'S1', ''],
              ['Résultat bas', null, 'B9*B6-B4', 'EUR', '', ''],
              ['Scénario central', 240, '', 'participants', 'S1', ''],
              ['Résultat central', null, 'B11*B6-B4', 'EUR', '', ''],
              ['Scénario haut', 300, '', 'participants', 'S1', ''],
              ['Résultat haut', null, 'B13*B6-B4', 'EUR', '', ''],
            ].map(([label, value, formula, unit, sourceId, assumption]) => ({
              label,
              value,
              formula,
              unit,
              sourceId,
              assumption,
            })),
          },
        ],
      },
    ],
  };
}
