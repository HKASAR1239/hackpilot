'use client';
import { useEffect, useState } from 'react';
import { Check, Circle, Clock3, Loader2 } from 'lucide-react';
import type { Mission } from '@/lib/types';
import { useLanguage } from '@/lib/language';

const steps = [
  'Sources',
  'Stratégie',
  'Production',
  'Vérification',
  'Livraison',
];
const descriptions = [
  'Lecture du brief et des documents.',
  'Choix de l’approche et des livrables utiles.',
  'Création des fichiers du projet.',
  'Vérification des fichiers et correction des problèmes.',
  'Préparation du dossier à télécharger.',
];
export function RunProgress({ mission }: { mission: Mission }) {
  const { t } = useLanguage();
  const running = ['running', 'queued'].includes(mission.status);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [mission.id, running]);
  const current = Math.max(
    0,
    mission.stages?.findIndex((stage) => stage.status === 'running') ?? 0,
  );
  const elapsed = Math.max(
    0,
    Math.floor(
      (now - Date.parse(mission.startedAt || mission.createdAt)) / 1000,
    ),
  );
  const duration = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  return (
    <section
      className={'execution-progress' + (running ? ' is-running' : '')}
      aria-label={t('Avancement du projet')}
    >
      {running && (
        <div className="execution-summary">
          <div aria-live="polite">
            <span className="execution-label">
              {t('Étape')} {current + 1} / {steps.length}
            </span>
            <h2>{t(steps[current])}</h2>
            <p>{mission.activity?.title || t(descriptions[current])}</p>
          </div>
          <span className="elapsed-time">
            <Clock3 size={15} /> {duration} <small>{t('écoulées')}</small>
          </span>
        </div>
      )}
      {mission.production && (
        <p className="checkpoint-progress">
          {
            Object.values(mission.production.checkpoints).filter(
              (c) => c.status === 'checked',
            ).length
          }
          /{mission.plan?.deliverables?.length || 1}{' '}
          {t('livrables enregistrés et contrôlés')}
        </p>
      )}
      {mission.currentCall && (
        <details className="call-diagnostics">
          <summary>
            {t('Détails de l’appel')} · {mission.currentCall.reasoningEffort}
          </summary>
          <p>
            {t('Début')} :{' '}
            {new Date(mission.currentCall.startedAt).toLocaleTimeString()}
          </p>
          <p>
            {t('Dernier événement reçu')} :{' '}
            {mission.currentCall.lastEventAt
              ? new Date(mission.currentCall.lastEventAt).toLocaleTimeString()
              : t('En attente')}
          </p>
          {running && (
            <p>
              {t('Le délai écoulé ne mesure pas la progression du modèle.')}
            </p>
          )}
          {(mission.currentCall.errors || []).map((e, i) => (
            <p key={i}>{e}</p>
          ))}
          {mission.currentCall.error && <p>{mission.currentCall.error}</p>}
        </details>
      )}
      <ol className="run-strip">
        {steps.map((step, index) => {
          const status = mission.stages?.[index]?.status || 'pending';
          return (
            <li
              key={step}
              className={status}
              aria-current={status === 'running' ? 'step' : undefined}
            >
              {status === 'done' ? (
                <Check size={15} />
              ) : status === 'running' ? (
                <Loader2 size={15} className="spin" />
              ) : (
                <Circle size={15} />
              )}
              <span>{t(step)}</span>
            </li>
          );
        })}
      </ol>
      {running && (
        <p className="execution-note">
          {t(
            'Le projet avance automatiquement. Vous pouvez le laisser travailler.',
          )}{' '}
          <span>{t('2 h maximum par tentative.')}</span>
        </p>
      )}
    </section>
  );
}
