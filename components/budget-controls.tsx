'use client';
import { useState } from 'react';
import { generationBudget } from '@/lib/generation-budget.mjs';
import { useLanguage } from '@/lib/language';
import type { Mission } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
const fields = [
  { key: 'calls', label: 'Appels', min: 1, max: 72 },
  { key: 'inputTokens', label: 'Jetons d’entrée', min: 1000, max: 10000000 },
  { key: 'outputTokens', label: 'Jetons de sortie', min: 1000, max: 2000000 },
  { key: 'repairs', label: 'Corrections du contenu', min: 0, max: 10 },
  {
    key: 'verificationRounds',
    label: 'Compléments de vérification',
    min: 0,
    max: 6,
  },
] as const;
export function BudgetControls({
  mission,
  onChange,
}: {
  mission: Mission;
  onChange: () => Promise<void>;
}) {
  const { t, locale } = useLanguage();
  const limits = generationBudget(mission);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const used = {
    calls: mission.usage?.calls || 0,
    inputTokens: mission.usage?.input || 0,
    outputTokens: mission.usage?.output || 0,
    repairs: mission.repairs || 0,
    verificationRounds: mission.verificationRecovery?.rounds || 0,
  };
  const running = ['running', 'queued'].includes(mission.status);
  async function save(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/missions/${mission.id}/budget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...Object.fromEntries(
            fields.map((f) => [f.key, Number(draft[f.key] ?? limits[f.key])]),
          ),
          reason: t('Budget ajusté depuis Pilotage.'),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Budget update failed.');
      setDraft({});
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>{t('Budget de génération')}</h2>
      <p className="control-intro">
        {t(
          'Les plafonds cumulent tous les appels. La reprise conserve la consommation et les fichiers enregistrés.',
        )}
      </p>
      <dl className="budget-usage">
        {fields.map((f) => (
          <div key={f.key}>
            <dt>{t(f.label)}</dt>
            <dd>
              {used[f.key].toLocaleString(locale)} /{' '}
              {limits[f.key].toLocaleString(locale)}
            </dd>
          </div>
        ))}
      </dl>
      {!running && (
        <details className="control-details">
          <summary>{t('Modifier le budget')}</summary>
          <form onSubmit={save}>
            {fields.map((f) => (
              <label key={f.key} htmlFor={'budget-' + f.key}>
                {t(f.label)}
                <Input
                  id={'budget-' + f.key}
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={1}
                  required
                  value={draft[f.key] ?? String(limits[f.key])}
                  onChange={(e) =>
                    setDraft({ ...draft, [f.key]: e.target.value })
                  }
                />
              </label>
            ))}
            <Button type="submit" variant="outline" disabled={busy}>
              {t('Enregistrer le budget')}
            </Button>
          </form>
        </details>
      )}
      {!!mission.budgetChanges?.length && (
        <details className="control-details">
          <summary>{t('Historique du budget')}</summary>
          {mission.budgetChanges.map((change, i) => (
            <p key={i}>
              {new Date(change.at).toLocaleString(locale)} — {change.reason}
            </p>
          ))}
        </details>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {t(error)}
        </p>
      )}
    </section>
  );
}
