import { writeFile, mkdir } from 'node:fs/promises';
const base = process.env.HACKPILOT_URL || 'http://127.0.0.1:4317';
const response = await fetch(base + '/api/missions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    brief:
      'Simulation de hackathon de 24 heures. Construire un outil web local pour une petite équipe qui prête du matériel audiovisuel. Ajouter un équipement avec un nom et une catégorie, rechercher les équipements disponibles, réserver un équipement pour une personne, puis le rendre disponible. Conserver les données après rechargement. Le parcours ajouter puis réserver puis rendre doit être réellement utilisable. Critères : fonctionnement complet, clarté du design, utilité. Vidéo de démonstration : trois minutes. Ne pas utiliser de service externe.',
    url: '',
    hours: 24,
    provider: 'codex',
  }),
});
const first = await response.json();
if (!response.ok) throw new Error(first.error);
console.log('Mission réelle : ' + first.id);
let final;
while (true) {
  const r = await fetch(base + '/api/missions/' + first.id);
  final = await r.json();
  console.log(
    new Date().toISOString() +
      ' ' +
      final.status +
      ' · ' +
      (final.events.at(-1)?.message || ''),
  );
  if (!['running', 'queued'].includes(final.status)) break;
  await new Promise((r) => setTimeout(r, 12000));
}
await mkdir('validation', { recursive: true });
await writeFile(
  'validation/live-result.json',
  JSON.stringify(
    {
      id: final.id,
      status: final.status,
      provider: final.provider,
      name: final.name,
      selected: final.plan?.ideas.find((i) => i.id === final.plan.selectedId),
      tests: final.tests,
      review: final.review,
      repairs: final.repairs,
      usage: final.usage,
      error: final.error,
      previewUrl: final.previewUrl,
    },
    null,
    2,
  ),
);
if (final.status !== 'completed') process.exitCode = 1;
