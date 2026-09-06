const messages = {
  'La connexion au modèle a échoué après plusieurs tentatives. Les résultats enregistrés sont conservés. Vérifiez le diagnostic avant de reprendre.':
    'The model connection failed after several attempts. Saved results are preserved. Check the diagnostics before resuming.',
  'Pertinence pour le sujet et les utilisateurs visés':
    'Relevance to the assignment and intended user',
  'Justesse, faisabilité et résultat utilisable':
    'Correctness, feasibility and usable core result',
  'Preuves, hypothèses explicites et valeur démontrée':
    'Evidence, explicit assumptions and demonstrated value',
  'Clarté de la présentation et livrables utilisables':
    'Clear presentation and usable deliverables',
  'L’échéance du projet est atteinte. Les livrables enregistrés restent disponibles.':
    'The project deadline has been reached. Saved deliverables remain available.',
  'Le jalon est atteint. Reprenez dans la limite de l’échéance initiale.':
    'Milestone time reached. Resume to continue within the original deadline.',
  'L’échéance doit se situer dans les 30 prochains jours.':
    'Deadline must be within the next 30 days.',
  'Le budget doit être compris entre 8 et 72 appels.':
    'Generation budget must be between 8 and 72 calls.',
  'Modifiez l’échéance entre deux exécutions.':
    'Change the deadline between runs.',
  'Aucune version contrôlée n’est encore disponible.':
    'No verified version is available yet.',
  'Le projet a déjà reçu 40 contributions.':
    'This project already contains 40 contributions.',
  'Saisissez un type et une contribution de 8 000 caractères maximum.':
    'Provide a contribution type and up to 8,000 characters.',
  'La limite de 30 minutes pour cet appel a été atteinte. Les livrables enregistrés sont conservés.':
    'The 30-minute limit for this call was reached. Saved deliverables are preserved.',
  'La génération Codex a échoué. Consultez le diagnostic de cet appel.':
    'Codex generation failed. Check the diagnostics for this call.',
  'Dossier assemblé : livrables, sources, vérifications et limites.':
    'Package assembled: deliverables, sources, checks and limitations.',
  'Production des livrables': 'Deliverable production',
  'Fichiers relus ; contenu et pages contrôlés.':
    'Files read back; content and pages checked.',
  'Fichier Excel relu ; formules recalculées et résultats conservés vérifiés.':
    'Excel file read back; formulas recalculated and saved results checked.',
  'Nouvelle mission': 'New project',
  'Démonstration prédéfinie ; les tests seront réellement exécutés.':
    'Preset example; browser tests will run. The example content is in French.',
  'Génération originale avec Codex. Aucune validation intermédiaire requise.':
    'Project generation started with Codex.',
  'Dossier assemblé : code, stratégie, scénarios, preuves et limites.':
    'Package assembled: code, strategy, scenarios, results and limitations.',
  'Arrêt demandé.': 'Stop requested.',
  'Mission arrêtée.': 'Project stopped.',
  'Mission interrompue.': 'Project interrupted.',
  'Limite de 2 heures atteinte.': 'The two-hour limit was reached.',
  'Le modèle a dépassé la limite de 2 heures pour cette étape.':
    'The model exceeded the two-hour limit for this step.',
  'Limite de 15 minutes atteinte.': 'The 15-minute limit was reached.',
  'Le budget de génération est atteint. Les résultats sont conservés.':
    'The generation budget was reached. Results have been saved.',
  'Le modèle a dépassé la limite de 5 minutes pour cette étape.':
    'The model exceeded the five-minute limit for this stage.',
  'Exécution interrompue.': 'Execution interrupted.',
  'Le prototype s’ouvre et propose des interactions':
    'The prototype opens and provides interactive controls',
  'Page HTTP accessible, titre, contenu et contrôles détectés.':
    'Page accessible; title, content and controls detected.',
  'Page incomplète ou non interactive.':
    'The page is incomplete or has no interactive controls.',
  'Le prototype tient dans un écran mobile':
    'The prototype fits a mobile screen',
  'Un débordement horizontal a été détecté à 390 px.':
    'Horizontal overflow detected at 390 px.',
  'Aucun débordement horizontal à 390 px.': 'No horizontal overflow at 390 px.',
  'Aucune erreur JavaScript pendant les parcours':
    'No JavaScript errors during testing',
  'Aucune exception JavaScript observée.': 'No JavaScript exception observed.',
  'Des vérifications échouent encore. Les résultats et fichiers sont conservés ; aucune réussite n’est déclarée.':
    'Checks are still failing. Results and files have been saved; no success is declared.',
  'La génération Codex a échoué. Vérifiez sa connexion et reprenez la mission.':
    'Codex generation failed. Check the connection and resume the project.',
  'La connexion Codex a expiré. Lancez npm run login.':
    'The Codex connection expired. Run npm run login.',
  'La limite du fournisseur a été atteinte. La mission est conservée pour reprise.':
    'The provider limit was reached. The project has been saved for resuming.',
  'Le moteur a été arrêté. La mission peut reprendre depuis le dernier résultat enregistré.':
    'The service was stopped. The project can resume from its last saved result.',
};
export function englishMessage(text) {
  if (messages[text]) return messages[text];
  const patterns = [
    [
      /^Le budget de génération est atteint\. Les résultats sont conservés\. (calls|inputTokens|outputTokens) : (\d+) \/ (\d+)\. Modifiez le budget dans Pilotage avant de reprendre\.$/,
      (m) =>
        `Generation budget reached (${m[1]}: ${m[2]} / ${m[3]}). Saved results are preserved. Change the budget in Control room before resuming.`,
    ],
    [
      /^Le temps alloué à cet appel \((\d+) s\) est écoulé\. Les livrables enregistrés sont conservés\.$/,
      (m) =>
        `The time allocated to this call (${m[1]} s) has elapsed. Saved deliverables are preserved.`,
    ],
    [
      /^(\d+) source\(s\) disponible\(s\)\.$/,
      (m) => `${m[1]} source(s) available.`,
    ],
    [/^Source indisponible : (.*)$/s, (m) => `Source unavailable: ${m[1]}`],
    [/^Concept retenu : (.*)$/s, (m) => `Selected concept: ${m[1]}`],
    [
      /^(\d+) fichiers générés\. Le prototype est accessible\.$/,
      (m) => `${m[1]} files created. The prototype is available.`,
    ],
    [
      /^(\d+)\/(\d+) vérifications réussies\.$/,
      (m) => `${m[1]}/${m[2]} checks passed.`,
    ],
    [
      /^Correction automatique (\d+)\/2 à partir des défauts observés\.$/,
      (m) => `Repair ${m[1]}/2 based on observed issues.`,
    ],
    [
      /^(\d+) étapes exécutées, assertions vérifiées\.$/,
      (m) => `${m[1]} steps executed; assertions verified.`,
    ],
  ];
  for (const [pattern, replacement] of patterns) {
    const match = text.match(pattern);
    if (match) return replacement(match);
  }
  return text;
}
const french = Object.fromEntries(
  Object.entries(messages).map(([fr, en]) => [en, fr]),
);
export function frenchMessage(text) {
  return french[text] || text;
}
