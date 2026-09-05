'use client';
import type { Mission } from '@/lib/types';
import { useLanguage } from '@/lib/language';
import { Check, Circle, AlertCircle, ClipboardCheck } from 'lucide-react';
export function QualityEvidence({ mission }: { mission: Mission }) {
  const { t } = useLanguage();
  const design = mission.design;
  if (!design) return null;
  const checked = Object.values(mission.production?.checkpoints || {}).filter(
    (c) => c.status === 'checked',
  ).length;
  return (
    <section
      className="panel quality-evidence"
      aria-label={t('Décisions et preuves')}
    >
      <h2>
        <ClipboardCheck size={18} />
        {t('Décisions et preuves')}
      </h2>
      <p>{design.recommendation}</p>
      <div className="quality-facts">
        <span>
          {design.facts.length} {t('faits sourcés')}
        </span>
        <span>
          {design.assumptions.length} {t('hypothèses explicites')}
        </span>
        <span>
          {checked}/{mission.plan?.deliverables?.length || 1}{' '}
          {t('livrables enregistrés et contrôlés')}
        </span>
      </div>
      <details>
        <summary>{t('Approches comparées')}</summary>
        {design.alternatives.map((a, i) => (
          <div className="quality-entry" key={i}>
            <strong>{a.approach}</strong>
            <p>{a.benefit}</p>
            <p>{a.tradeoff}</p>
            <small>{a.decision}</small>
          </div>
        ))}
      </details>
      <details>
        <summary>{t('Faits et hypothèses')}</summary>
        {design.facts.map((f) => (
          <div className="quality-entry" key={f.id}>
            <strong>{f.statement}</strong>
            <p>
              {f.sourceId} · {f.quote}
            </p>
          </div>
        ))}
        {design.assumptions.map((a) => (
          <div className="quality-entry" key={a.id}>
            <strong>{a.statement}</strong>
            <p>{a.impact}</p>
            <small>{a.validation}</small>
          </div>
        ))}
      </details>
      <details open>
        <summary>{t('Critères de vérification')}</summary>
        <p className="quality-note">
          {t(
            'Les preuves renvoient aux livrables et aux contrôles effectués. Elles ne remplacent pas une validation terrain.',
          )}
        </p>
        {design.acceptanceCriteria.map((c) => {
          const review = mission.review?.checks?.find(
            (r) => r.criterionId === c.id,
          );
          return (
            <div className="quality-criterion" key={c.id}>
              {!review ? (
                <Circle size={15} />
              ) : review.status === 'met' ? (
                <Check size={15} />
              ) : (
                <AlertCircle size={15} />
              )}
              <div>
                <strong>{c.criterion}</strong>
                <p>{review ? review.evidence : c.evidence}</p>
                <small>
                  {review
                    ? t(
                        review.status === 'met'
                          ? 'Vérifié par relecture'
                          : 'À corriger ou confirmer',
                      )
                    : t('À vérifier')}{' '}
                  · {c.deliverableIds.join(', ')}
                </small>
              </div>
            </div>
          );
        })}
      </details>
    </section>
  );
}
