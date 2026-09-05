const messages = {
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
