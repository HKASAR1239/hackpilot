'use client';
import { useState, useSyncExternalStore } from 'react';
import { useContributionDraft } from '@/lib/use-contribution-draft';
import {
  CalendarClock,
  ClipboardList,
  MessageSquarePlus,
  ShieldCheck,
  Download,
  Send,
  Loader2,
  Check,
  Clock3,
  CircleHelp,
} from 'lucide-react';
import type { Mission } from '@/lib/types';
import { useLanguage } from '@/lib/language';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';

const states: Record<string, string> = {
  queued: 'Reçue',
  evaluating: 'En évaluation',
  testing: 'Version d’essai',
  integrated: 'Intégrée',
  deferred: 'Différée',
  rejected: 'Écartée',
  strong: 'Convaincant',
  partial: 'Partiellement démontré',
  missing: 'Manquant',
  unverified: 'Non vérifié',
};
const kinds: Record<string, string> = {
  idea: 'Idée',
  evidence: 'Observation ou source',
  correction: 'Correction factuelle',
  constraint: 'Nouvelle contrainte',
};
function date(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
async function post(path: string, payload: unknown) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await r.json();
  if (!r.ok)
    throw new Error(
      typeof result === 'object' && result !== null && 'error' in result
        ? String(result.error)
        : 'Request failed.',
    );
  return result;
}
const clockSnapshot = () => Math.floor(Date.now() / 10000) * 10000;
const serverClock = () => 0;
const subscribeClock = (listener: () => void) => {
  const timer = setInterval(listener, 10000);
  return () => clearInterval(timer);
};
export function ScheduleSummary({ mission }: { mission: Mission }) {
  const { t, locale } = useLanguage();
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, serverClock);
  const schedule = mission.schedule;
  if (!schedule) return null;
  const minutes = now
    ? Math.max(0, Math.ceil((Date.parse(schedule.deadlineAt) - now) / 60000))
    : null;
  const remaining =
    minutes === null
      ? '—'
      : minutes >= 1440
        ? `${Math.floor(minutes / 1440)} ${t('jours')} ${Math.floor((minutes % 1440) / 60)} h`
        : minutes >= 60
          ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
          : `${minutes} min`;
  return (
    <div
      className="schedule-summary"
      aria-label={t('Temps et version conservée')}
    >
      <div>
        <CalendarClock size={18} />
        <span>
          <small>{t('Échéance du projet')}</small>
          <strong>{date(schedule.deadlineAt, locale)}</strong>
        </span>
      </div>
      <div>
        <Clock3 size={18} />
        <span>
          <small>{t('Temps restant')}</small>
          <strong>{remaining}</strong>
        </span>
      </div>
      <div>
        <span>
          <small>{t('Appels utilisés')}</small>
          <strong>
            {mission.usage?.calls || 0} / {schedule.callBudget}
          </strong>
        </span>
      </div>
      {minutes !== null &&
        minutes < 10 &&
        ['failed', 'cancelled', 'interrupted', 'paused', 'expired'].includes(
          mission.status,
        ) && (
          <output>
            {t(
              'La reprise conserve cette échéance. Si le délai le permet, modifiez-la avant de relancer.',
            )}{' '}
            <a href={`#project=${mission.id}&tab=control`}>
              {t('Modifier l’échéance')}
            </a>
          </output>
        )}
      {mission.lastVerified && (
        <a
          className="verified-download"
          href={`/api/missions/${mission.id}/verified-export`}
        >
          <ShieldCheck size={17} />
          <span>
            {t('Version contrôlée')}
            <small>
              {mission.lastVerified.files.length} {t('fichiers')} ·{' '}
              {t(mission.lastVerified.complete ? 'Complète' : 'Partielle')}
            </small>
          </span>
          <Download size={15} />
        </a>
      )}
    </div>
  );
}
export function AdaptiveWorkspace({
  mission,
  onChange,
}: {
  mission: Mission;
  onChange: () => Promise<void>;
}) {
  const { t, locale } = useLanguage();
  const { draft, update, clear } = useContributionDraft(mission.id);
  const { text, kind, author, ready: loaded } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deadline, setDeadline] = useState('');
  const [versionId, setVersionId] = useState('');
  const running = ['running', 'queued'].includes(mission.status);
  async function contribute(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await post(`/api/missions/${mission.id}/contributions`, {
        kind,
        text,
        author,
        requestId: draft.requestId,
      });
      clear(draft.requestId);
      setNotice(
        'Contribution enregistrée. Elle sera évaluée après la validation de la version en cours.',
      );
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function changeDeadline(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post(`/api/missions/${mission.id}/schedule`, {
        deadlineAt: new Date(deadline).toISOString(),
      });
      setDeadline('');
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  if (mission.workflowVersion !== 2)
    return (
      <section className="panel">
        <p>
          {t(
            'Le pilotage adaptatif est disponible pour les nouveaux projets. Ce projet conserve son fonctionnement initial.',
          )}
        </p>
      </section>
    );
  return (
    <div className="adaptive-workspace">
      <section
        className="panel rubric-panel"
        aria-label={t('Grille et évaluation')}
      >
        <div className="control-heading">
          <h2>
            <ClipboardList size={19} />
            {t('Grille et évaluation')}
          </h2>
          <span className="control-badge">
            {t(
              mission.rubric?.mode === 'official'
                ? 'Critères officiels'
                : mission.rubric
                  ? 'Grille interne'
                  : 'Lecture des sources',
            )}
          </span>
        </div>
        <p className="control-intro">
          {t(
            mission.rubric?.mode === 'official'
              ? 'Les critères et leurs sources sont conservés. Chaque critère fait l’objet d’une évaluation séparée.'
              : 'Sans grille officielle fournie, des critères internes guident la production. Ils ne constituent pas un barème officiel.',
          )}
        </p>
        {mission.rubric?.uncertainties.map((u, i) => (
          <p className="control-uncertainty" key={i}>
            <CircleHelp size={15} />
            {u}
          </p>
        ))}
        {!!mission.selection?.options.length && (
          <details className="control-details">
            <summary>{t('Choix de l’approche')}</summary>
            {mission.selection.options.map((option) => (
              <div className="quality-entry" key={option.ideaId}>
                <strong>
                  {
                    mission.plan?.ideas.find(
                      (idea) => idea.id === option.ideaId,
                    )?.title
                  }
                  {option.ideaId === mission.selection?.selectedId
                    ? ' · ' + t('Retenue')
                    : ''}
                </strong>
                <p>{option.risk}</p>
                {option.ratings.map((rating) => (
                  <p key={rating.criterionId}>
                    <small>
                      {
                        mission.rubric?.criteria.find(
                          (c) => c.id === rating.criterionId,
                        )?.label
                      }
                    </small>
                    <br />
                    {rating.evidence}
                  </p>
                ))}
              </div>
            ))}
          </details>
        )}
        {mission.jury && (
          <div className="jury-summary">
            <p>{mission.jury.summary}</p>
            <small>
              {t(
                'Appréciation du modèle fondée sur les livrables et les contrôles disponibles. Aucun classement n’est prédit.',
              )}
            </small>
          </div>
        )}
        <div className="rubric-list">
          {mission.rubric?.criteria.map((criterion) => {
            const review = mission.jury?.checks.find(
              (c) => c.criterionId === criterion.id,
            );
            return (
              <article className="rubric-item" key={criterion.id}>
                <div className="rubric-title">
                  <h3>{t(criterion.label)}</h3>
                  <span>
                    {criterion.weight === null
                      ? t('Poids non précisé')
                      : `${criterion.weight} · ${t('poids officiel')}`}
                  </span>
                </div>
                <span
                  className={`assessment-state state-${review?.status || 'pending'}`}
                >
                  {review?.status === 'strong' ? (
                    <Check size={13} />
                  ) : (
                    <Clock3 size={13} />
                  )}
                  {t(review ? states[review.status] : 'À évaluer')}
                </span>
                {review?.evidence.map((e, i) => (
                  <p key={i} className="rubric-proof">
                    <span>{e.path}</span>
                    {e.detail}
                  </p>
                ))}
                {review?.gap && <p>{review.gap}</p>}
                {criterion.quote && (
                  <details>
                    <summary>
                      {t('Voir la source')} · {criterion.sourceId}
                    </summary>
                    <blockquote>{criterion.quote}</blockquote>
                    {criterion.weightQuote !== criterion.quote && (
                      <p>{criterion.weightQuote}</p>
                    )}
                  </details>
                )}
              </article>
            );
          })}
        </div>
        {mission.jury?.improvements.length ? (
          <details className="control-details">
            <summary>{t('Améliorations proposées')}</summary>
            {mission.jury.improvements.map((i, index) => (
              <div key={index}>
                <p>{i.detail}</p>
                <small>
                  {i.estimatedMinutes} min · {t('estimation à confirmer')}
                </small>
              </div>
            ))}
          </details>
        ) : null}
      </section>
      <div className="control-side">
        <section
          className="panel contribution-panel"
          aria-label={t('Contributions de l’équipe')}
        >
          <h2>
            <MessageSquarePlus size={19} />
            {t('Contributions de l’équipe')}
          </h2>
          <p className="control-intro">
            {t(
              'Proposez une idée ou partagez une observation pendant le run. Les auteurs sont masqués lors de l’évaluation ; une version d’essai est comparée au résultat existant avant intégration.',
            )}
          </p>
          <form onSubmit={contribute}>
            <div className="contribution-fields">
              <div>
                <label htmlFor="contribution-kind">
                  {t('Type de contribution')}
                </label>
                <NativeSelect
                  id="contribution-kind"
                  disabled={busy || !loaded}
                  value={kind}
                  onChange={(e) => update({ kind: e.target.value })}
                >
                  {Object.entries(kinds).map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <label htmlFor="contribution-author">
                  {t('Nom (facultatif)')}
                </label>
                <Input
                  id="contribution-author"
                  disabled={busy || !loaded}
                  value={author}
                  maxLength={80}
                  onChange={(e) => update({ author: e.target.value })}
                />
              </div>
            </div>
            <label htmlFor="contribution-text">{t('Votre contribution')}</label>
            <Textarea
              id="contribution-text"
              disabled={busy || !loaded}
              value={text}
              maxLength={8000}
              rows={5}
              required
              placeholder={t(
                'Décrivez le changement, son intérêt et les éléments qui le soutiennent.',
              )}
              onChange={(e) => update({ text: e.target.value })}
            />
            <div className="contribution-submit">
              <small>{text.length} / 8 000</small>
              <Button type="submit" disabled={!loaded || busy || !text.trim()}>
                {busy ? (
                  <Loader2 size={15} className="spin" />
                ) : (
                  <Send size={15} />
                )}{' '}
                {t('Proposer')}
              </Button>
            </div>
          </form>
          {notice && <output className="control-notice">{t(notice)}</output>}
          {!running &&
            (mission.contributions || []).some(
              (c) => c.status === 'queued',
            ) && (
              <p className="control-notice">
                {t(
                  'Reprenez le projet pour évaluer les contributions en attente.',
                )}
              </p>
            )}
          <div className="contribution-list">
            {[...(mission.contributions || [])].reverse().map((c) => (
              <article className="contribution-item" key={c.id}>
                <div className="contribution-meta">
                  <span>
                    {t(kinds[c.kind])} · {c.author || t('Équipe')}
                  </span>
                  <span className={`assessment-state state-${c.status}`}>
                    {t(states[c.status])}
                  </span>
                </div>
                <p className="contribution-text">{c.text}</p>
                <small>{date(c.createdAt, locale)}</small>
                {c.result && <p className="contribution-result">{c.result}</p>}
                {c.assessment && (
                  <details>
                    <summary>{t('Voir l’évaluation')}</summary>
                    <p>{c.assessment.reason}</p>
                    <small>
                      {c.assessment.estimatedMinutes} min ·{' '}
                      {t('estimation à confirmer')}
                    </small>
                    {c.assessment.checks.map((check) => (
                      <p key={check.criterionId}>
                        <strong>
                          {
                            mission.rubric?.criteria.find(
                              (r) => r.id === check.criterionId,
                            )?.label
                          }
                        </strong>{' '}
                        — {check.evidence}
                      </p>
                    ))}
                    {c.assessment.risks.map((risk, i) => (
                      <p key={i}>{risk}</p>
                    ))}
                  </details>
                )}
                {c.comparison && (
                  <details>
                    <summary>{t('Comparaison des versions')}</summary>
                    <p>{c.comparison.reason}</p>
                  </details>
                )}
              </article>
            ))}
          </div>
        </section>
        <section className="panel milestone-panel">
          <h2>
            <CalendarClock size={19} />
            {t('Jalons et échéance')}
          </h2>
          <p className="control-intro">
            {t(
              'La reprise conserve la deadline et le budget consommé. Les contrôles disposent d’une réserve de temps. Les projets longs avancent par sessions de deux heures maximum.',
            )}
          </p>
          {!!mission.verifiedVersions?.length && (
            <div className="version-history">
              <label htmlFor="saved-version">
                {t('Versions contrôlées conservées')}
              </label>
              <NativeSelect
                id="saved-version"
                value={versionId || mission.lastVerified?.id || ''}
                onChange={(e) => setVersionId(e.target.value)}
              >
                {[...mission.verifiedVersions].reverse().map((version) => (
                  <option key={version.id} value={version.id}>
                    {date(version.at, locale)} · {version.files.length}{' '}
                    {t('fichiers')} ·{' '}
                    {t(version.complete ? 'Complète' : 'Partielle')}
                  </option>
                ))}
              </NativeSelect>
              <a
                className="button-link"
                href={`/api/missions/${mission.id}/verified-export?version=${encodeURIComponent(versionId || mission.lastVerified?.id || '')}`}
              >
                <Download size={14} />
                {t('Télécharger cette version')}
              </a>
            </div>
          )}
          {mission.schedule?.milestones.map((milestone, index) => (
            <div className="milestone-row" key={index}>
              <Check size={14} />
              <span>{t(milestone.title)}</span>
              <small>{date(milestone.at, locale)}</small>
            </div>
          ))}
          {!running && (
            <details className="control-details">
              <summary>{t('Modifier l’échéance')}</summary>
              <form onSubmit={changeDeadline}>
                <label htmlFor="project-deadline">
                  {t('Nouvelle échéance')}
                </label>
                <Input
                  id="project-deadline"
                  type="datetime-local"
                  required
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={busy || !deadline}
                >
                  {t('Enregistrer l’échéance')}
                </Button>
              </form>
            </details>
          )}
        </section>
        {error && (
          <p className="error-banner" role="alert">
            {t(error)}
          </p>
        )}
      </div>
    </div>
  );
}
