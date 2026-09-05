'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type {
  Mission,
  MissionSummary,
  Health,
  UploadedDocument,
} from '@/lib/types';
import { useLanguage } from '@/lib/language';
import { DocumentUpload, warningLabels } from '@/components/document-upload';
import {
  ArrowUpRight,
  ArrowRight,
  Play,
  Plus,
  Terminal,
  Check,
  Circle,
  Loader2,
  FileCode2,
  FlaskConical,
  Download,
  Link2,
  Square,
  ChevronRight,
  FolderOpen,
  Layers3,
  Clock3,
  Settings2,
  PanelLeft,
  FileText,
  ListChecks,
  Monitor,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Sidebar, SidebarProvider } from '@/components/ui/sidebar';
const phases = [
  'Sources',
  'Stratégie',
  'Production',
  'Vérification',
  'Livraison',
];
const statuses: Record<string, string> = {
  queued: 'En attente',
  running: 'En cours',
  completed: 'Prototype vérifié',
  failed: 'À reprendre',
  cancelled: 'Arrêtée',
  interrupted: 'Interrompue',
};
const example =
  'Construire une application pour coordonner les surplus alimentaires d’une association. Ajouter un don avec sa quantité, filtrer les disponibilités et réserver une collecte. Le prototype doit fonctionner localement et conserver les données après rechargement. Critères : utilité, fonctionnement et design. Démonstration de 3 minutes.';
async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  const r = await fetch('/api' + path, { ...init, headers });
  const data: unknown = await r.json();
  if (!r.ok)
    throw new Error(
      typeof data === 'object' && data !== null && 'error' in data
        ? String(data.error)
        : 'La requête a échoué.',
    );
  return data as T;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : 'La requête a échoué.';
}
export default function Home() {
  const { locale, setLocale, t } = useLanguage();
  const [documents, setDocuments] = useState<UploadedDocument[]>([]),
    [uploading, setUploading] = useState(false);
  const [missions, setMissions] = useState<MissionSummary[]>([]),
    [active, setActive] = useState<Mission | null>(null);
  const [health, setHealth] = useState<Health | null>(null),
    [brief, setBrief] = useState(''),
    [url, setUrl] = useState('');
  const [hours, setHours] = useState('24'),
    [provider, setProvider] = useState('auto');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [tab, setTab] = useState('overview');
  const [file, setFile] = useState<{
    path: string;
    content: string;
  } | null>(null);
  async function refresh(id?: string) {
    setMissions(await api<MissionSummary[]>('/missions'));
    if (id) setActive(await api<Mission>('/missions/' + id));
  }
  useEffect(() => {
    api<Health>('/health')
      .then(setHealth)
      .catch(() =>
        setError(t('Le moteur local est indisponible. Relancez HackPilot.')),
      );
    api<MissionSummary[]>('/missions')
      .then(setMissions)
      .catch(() => {});
  }, [t]);
  const activeId = active?.id,
    activeStatus = active?.status;
  useEffect(() => {
    if (
      !activeId ||
      !activeStatus ||
      !['running', 'queued'].includes(activeStatus)
    )
      return;
    const t = setInterval(
      () => refresh(activeId).catch((e) => setError(message(e))),
      1800,
    );
    return () => clearInterval(t);
  }, [activeId, activeStatus]);
  async function launch(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const m = await api<Mission>('/missions', {
        method: 'POST',
        body: JSON.stringify({
          brief,
          url,
          hours: Number(hours),
          provider,
          locale,
          documentIds: documents.map((doc) => doc.id),
        }),
      });
      setActive(m);
      setTab('overview');
      await refresh(m.id);
    } catch (e: unknown) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function action(kind: string) {
    if (!active) return;
    setError('');
    try {
      await api('/missions/' + active.id + '/' + kind, {
        method: 'POST',
        body: '{}',
      });
      await refresh(active.id);
    } catch (e: unknown) {
      setError(message(e));
    }
  }
  async function readFile(path: string) {
    if (!active) return;
    try {
      setFile(
        await api<{
          path: string;
          content: string;
        }>('/missions/' + active.id + '/file?path=' + encodeURIComponent(path)),
      );
    } catch (e: unknown) {
      setError(message(e));
    }
  }
  const running = active && ['running', 'queued'].includes(active.status);
  const webProject =
    !active?.plan?.deliverables ||
    active.plan.deliverables.some((d) => d.kind === 'web');
  const downloadFile = (path: string) =>
    '/api/missions/' +
    active?.id +
    '/download?path=' +
    encodeURIComponent(path);
  const chosen = active?.plan?.ideas.find(
    (i) => i.id === active.plan?.selectedId,
  );
  return (
    <SidebarProvider className="app-shell">
      <Sidebar collapsible="none" className="rail">
        <Link className="brand" href="/" aria-label={t('HackPilot accueil')}>
          <span className="brand-mark">
            <PanelLeft size={19} />
          </span>
          HackPilot
        </Link>
        <div className="rail-section">{t('Espace de travail')}</div>
        <Button
          className="new-mission"
          onClick={() => {
            setActive(null);
            setFile(null);
            setError('');
          }}
        >
          <Plus size={17} />
          {t('Nouveau projet')}
        </Button>
        <div className="project-list-heading">
          {t('Projets')}
          <span>{missions.length}</span>
        </div>
        <nav className="mission-nav" aria-label={t('Projets')}>
          {missions.length === 0 ? (
            <p className="nav-empty">{t('Vos projets apparaîtront ici.')}</p>
          ) : (
            missions.map((m) => (
              <button
                key={m.id}
                title={m.name}
                aria-current={active?.id === m.id ? 'page' : undefined}
                className={
                  'mission-link ' + (active?.id === m.id ? 'selected' : '')
                }
                onClick={() => {
                  setFile(null);
                  setTab('overview');
                  refresh(m.id).catch((e) => setError(e.message));
                }}
              >
                <span className={'status-dot ' + m.status} />
                <span className="project-name">
                  <span>{m.name}</span>
                  <small>
                    {new Date(m.createdAt).toLocaleDateString(
                      locale === 'en' ? 'en-GB' : 'fr-FR',
                      {
                        day: 'numeric',
                        month: 'short',
                      },
                    )}{' '}
                    ·{' '}
                    {t(
                      m.status === 'completed' ? 'Terminé' : statuses[m.status],
                    )}
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))
          )}
        </nav>
        <div className="rail-foot">
          <div className="local-indicator">
            <span className={health ? 'online-dot' : 'offline-dot'} />
            {health ? t('Service disponible') : t('Connexion en cours…')}
          </div>
          <p>{t('Enregistré sur cet ordinateur.')}</p>
          <span className="license">{t('Licence MIT')}</span>
        </div>
      </Sidebar>
      <main className="workspace">
        <header className="topbar">
          <span>
            {t('Projets')}
            <ChevronRight size={14} />
            <strong>{active ? active.name : t('Nouveau projet')}</strong>
          </span>
          <label className="language-picker" htmlFor="language">
            <span className="sr-only">Langue / Language</span>
            <NativeSelect
              id="language"
              aria-label="Langue / Language"
              value={locale}
              onChange={(e) => setLocale(e.target.value === 'en' ? 'en' : 'fr')}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </NativeSelect>
          </label>
          <span className="workspace-location">
            <Monitor size={15} />
            {t('Espace local')}
          </span>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={18} />
            {t(error)}
            <button
              onClick={() => setError('')}
              aria-label={t('Fermer l’erreur')}
            >
              ×
            </button>
          </div>
        )}
        {!active ? (
          <div className="launch-layout">
            <div className="page-heading">
              <h1>{t('Nouveau projet')}</h1>
              <p>
                {t(
                  'Ajoutez l’énoncé de votre hackathon ou de votre étude de cas.',
                )}
              </p>
            </div>
            <section
              className="launch-main"
              aria-label={t('Configuration du projet')}
            >
              <form onSubmit={launch} className="launch-form">
                <div className="form-heading">
                  <h2>{t('Brief du projet')}</h2>
                  <span>{t('01 / Configuration')}</span>
                </div>
                <div className="form-fields">
                  <label htmlFor="source-url">
                    {t('Lien de l’énoncé')}
                    <span>{t('Facultatif')}</span>
                  </label>
                  <div className="url-input">
                    <Link2 size={16} />
                    <Input
                      id="source-url"
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://hackathon.devpost.com"
                    />
                  </div>
                  <label htmlFor="brief">{t('Objectif et contraintes')}</label>
                  <Textarea
                    id="brief"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder={t(
                      'Précisez les questions à résoudre, les livrables attendus, les données et les critères d’évaluation.',
                    )}
                    rows={7}
                  />
                  <p className="field-help">
                    {t(
                      'Le texte du règlement peut être ajouté directement au brief.',
                    )}
                  </p>
                  <div className="examples">
                    <span>{t('Exemples')}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setBrief(example);
                        setUrl('');
                        setProvider('demo');
                        setSettingsOpen(true);
                      }}
                    >
                      {t('Coordination de dons')}
                      <ArrowUpRight size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBrief(
                          'Créer un agent qui résout un problème métier. Application publique et vidéo de 3 minutes maximum. Fonctionnement, présentation, créativité et viabilité : 25 % chacun. Le jury ne téléchargera pas le code.',
                        );
                        setUrl('https://100agents.devpost.com/');
                        setProvider('auto');
                      }}
                    >
                      100 Agents · 2025 <ArrowUpRight size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBrief(
                          locale === 'en'
                            ? 'One-hour case study simulation. A company offers workshops for EUR 120 per participant. Variable cost is EUR 45 per participant and monthly fixed costs are EUR 18000. Monthly capacity is 300 participants. Evaluate scenarios of 180, 240 and 300 participants, calculate break-even and recommend whether to launch. Deliver a written analysis in PDF, exactly 4 PowerPoint slides and an Excel workbook with formulas. Distinguish the supplied data from assumptions.'
                            : 'Simulation d’étude de cas d’une heure. Une entreprise propose des ateliers à 120 EUR par participant. Le coût variable est de 45 EUR par participant et les coûts fixes mensuels sont de 18000 EUR. Capacité mensuelle : 300 participants. Évaluer les scénarios de 180, 240 et 300 participants, calculer le seuil de rentabilité et recommander ou non le lancement. Livrer une analyse écrite en PDF, exactement 4 slides PowerPoint et un tableur Excel avec formules. Distinguer les données fournies des hypothèses.',
                        );
                        setHours('1');
                        setUrl('');
                        setProvider('auto');
                      }}
                    >
                      {t('Étude de cas · 1 h')}
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                  <p className="field-help">
                    {t(
                      'Les livrables suivent l’énoncé. Un site ou un autre complément peut être ajouté s’il apporte une valeur concrète au sujet.',
                    )}
                  </p>
                  <DocumentUpload
                    documents={documents}
                    onChange={setDocuments}
                    onBusy={setUploading}
                    disabled={busy}
                  />
                  <div className="duration-field">
                    <label htmlFor="hours">{t('Temps disponible')}</label>
                    <div className="duration-input">
                      <Input
                        id="hours"
                        type="number"
                        min="1"
                        max="720"
                        value={hours}
                        onChange={(e) => setHours(e.target.value)}
                      />
                      <span>{t('heures')}</span>
                    </div>
                    <p className="field-help">
                      {t('Utilisée pour ajuster le périmètre du projet.')}
                    </p>
                  </div>
                  <div className="generation-settings">
                    <button
                      type="button"
                      className="settings-toggle"
                      aria-expanded={settingsOpen}
                      aria-controls="generation-settings"
                      onClick={() => setSettingsOpen(!settingsOpen)}
                    >
                      <Settings2 size={16} />
                      <span>{t('Paramètres de génération')}</span>
                      <small>
                        {provider === 'demo' ? t('Exemple prédéfini') : 'Codex'}
                      </small>
                      <ChevronRight size={15} />
                    </button>
                    <div id="generation-settings" hidden={!settingsOpen}>
                      <label htmlFor="provider">
                        {t('Mode de génération')}
                      </label>
                      <NativeSelect
                        id="provider"
                        value={provider}
                        onChange={(e) => setProvider(e.target.value)}
                      >
                        <option value="auto">{t('Automatique')}</option>
                        <option value="codex">{t('Connexion Codex')}</option>
                        <option value="demo">{t('Exemple prédéfini')}</option>
                      </NativeSelect>
                      <p className="field-help">
                        {provider === 'demo'
                          ? t(
                              'Projet de démonstration fixe, sans appel au modèle.',
                            )
                          : t(
                              'Le brief est transmis via votre connexion Codex.',
                            )}
                      </p>
                      <p className="field-help">
                        {t(
                          'Les nouveaux projets suivent la langue de l’interface. Les projets existants conservent leur contenu.',
                        )}
                      </p>
                      <div className="provider-status">
                        <span
                          className={
                            health?.providers?.codex
                              ? 'online-dot'
                              : 'offline-dot'
                          }
                        />
                        {health?.providers?.codex
                          ? t('Codex installé')
                          : t('Codex non détecté')}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="launch-bottom">
                  <p>
                    <Clock3 size={15} />
                    {t('Traitement : 15 min maximum')}
                  </p>
                  <Button
                    type="submit"
                    className="launch-button"
                    disabled={
                      busy ||
                      uploading ||
                      (!brief.trim() && !url.trim() && !documents.length)
                    }
                  >
                    {busy && <Loader2 className="spin" size={16} />}
                    {t('Créer le projet')}
                    <ArrowRight size={16} />
                  </Button>
                </div>
              </form>
            </section>
            <aside className="process-panel">
              <section className="deliverables">
                <h2>{t('Livrables du projet')}</h2>
                <div>
                  <FileCode2 size={17} />
                  <span>
                    <strong>{t('Formats adaptés à l’énoncé')}</strong>
                    <small>{t('PDF, PowerPoint, Excel ou prototype')}</small>
                  </span>
                </div>
                <div>
                  <ListChecks size={17} />
                  <span>
                    <strong>{t('Vérifications adaptées')}</strong>
                    <small>
                      {t('Contenu, calculs ou parcours fonctionnels')}
                    </small>
                  </span>
                </div>
                <div>
                  <FileText size={17} />
                  <span>
                    <strong>{t('Dossier de présentation')}</strong>
                    <small>{t('Réponse, sources et limites')}</small>
                  </span>
                </div>
              </section>
              <section className="process-section">
                <h2>{t('Étapes du projet')}</h2>
                <ol className="pipeline">
                  {phases.map((phase, i) => (
                    <li className="pipeline-step" key={phase}>
                      <span>{i + 1}</span>
                      <div>
                        <strong>{t(phase)}</strong>
                        <p>
                          {
                            [
                              t('Lecture des questions et des contraintes'),
                              t('Choix de l’approche et des livrables'),
                              t('Production des livrables retenus'),
                              t('Tests et corrections'),
                              t('Préparation des livrables'),
                            ][i]
                          }
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
              <p className="scope-note">
                {t(
                  'Les documents sont téléchargeables. Les prototypes web fonctionnent localement ; leurs intégrations externes restent à compléter.',
                )}
              </p>
            </aside>
          </div>
        ) : (
          <div className="mission-view">
            <div className="mission-heading">
              <div>
                <div className="eyebrow">
                  {t('Projet /')}
                  {active.id.slice(0, 8)}{' '}
                  <span className="mode-chip">
                    {active.provider === 'demo'
                      ? t('Exemple prédéfini')
                      : 'Codex'}
                  </span>
                </div>
                <h1>{chosen?.title || active.name}</h1>
                <p>{chosen?.concept || t('Préparation du projet en cours.')}</p>
              </div>
              <div className="mission-actions">
                {running ? (
                  <Button variant="outline" onClick={() => action('cancel')}>
                    <Square size={14} />
                    {t('Arrêter')}
                  </Button>
                ) : ['failed', 'cancelled', 'interrupted'].includes(
                    active.status,
                  ) ? (
                  <Button onClick={() => action('resume')}>
                    <Play size={14} />
                    {t('Reprendre')}
                  </Button>
                ) : null}
                {active.files?.length > 0 && (
                  <a
                    className="button-link"
                    href={'/api/missions/' + active.id + '/export'}
                  >
                    <Download size={16} />
                    {t('Exporter le projet')}
                  </a>
                )}
              </div>
            </div>
            <div className="run-strip">
              {phases.map((p, i) => {
                const s = active.stages?.[i];
                return (
                  <div key={p} className={s?.status || 'pending'}>
                    {s?.status === 'done' ? (
                      <Check size={16} />
                    ) : s?.status === 'running' ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Circle size={14} />
                    )}
                    <span>{t(p)}</span>
                  </div>
                );
              })}
            </div>
            <div className="metrics">
              <div>
                <span>{t('Statut')}</span>
                <strong
                  className={active.status === 'completed' ? 'green' : ''}
                >
                  {t(
                    active.status === 'completed' && !webProject
                      ? 'Livrables vérifiés'
                      : statuses[active.status],
                  )}
                </strong>
              </div>
              <div>
                <span>{t('Fichiers')}</span>
                <strong>{active.files?.length || '—'}</strong>
              </div>
              <div>
                <span>{t('Tests réussis')}</span>
                <strong>
                  {active.tests
                    ? active.tests.results.filter((t) => t.passed).length +
                      ' / ' +
                      active.tests.results.length
                    : '—'}
                </strong>
              </div>
              <div>
                <span>{t('Corrections')}</span>
                <strong>
                  {active.repairs || 0} <small>/ 2</small>
                </strong>
              </div>
            </div>
            {active.error && (
              <div className="error-banner" role="alert">
                {t(active.error)}
              </div>
            )}
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
              <TabsList variant="line" className="mission-tabs">
                <TabsTrigger value="overview">{t('Synthèse')}</TabsTrigger>
                <TabsTrigger value="project">
                  {t(webProject ? 'Aperçu & code' : 'Documents')}
                </TabsTrigger>
                <TabsTrigger value="tests">
                  {t(webProject ? 'Tests' : 'Vérifications')}
                </TabsTrigger>
                <TabsTrigger value="submission">{t('Livrables')}</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <div className="overview-grid">
                  <section className="panel">
                    <h2>
                      <Layers3 size={18} />
                      {t('Stratégie')}
                    </h2>
                    {active.plan ? (
                      <>
                        <p>{active.plan.summary}</p>
                        {active.plan.deliverables && (
                          <div className="expected-deliverables">
                            <h3>{t('Livrables retenus')}</h3>
                            {active.plan.deliverables.map((d) => (
                              <div key={d.id}>
                                <strong>{d.title}</strong>
                                <p>{d.reason}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="idea-list">
                          {active.plan.ideas.map((idea) => (
                            <div
                              className={
                                'idea ' +
                                (idea.id === active.plan?.selectedId
                                  ? 'chosen'
                                  : '')
                              }
                              key={idea.id}
                            >
                              <div>
                                <strong>{idea.title}</strong>
                                {idea.id === active.plan?.selectedId && (
                                  <span>{t('Sélectionné')}</span>
                                )}
                              </div>
                              <p>{idea.concept}</p>
                              <small>{idea.reason}</small>
                            </div>
                          ))}
                        </div>
                        <h3>{t('Points à confirmer')}</h3>
                        {active.plan.unknowns.length ? (
                          active.plan.unknowns.map((u: string, i: number) => (
                            <p className="unknown" key={i}>
                              <AlertCircle size={14} />
                              {u}
                            </p>
                          ))
                        ) : (
                          <p>
                            {t('Aucune inconnue identifiée par le moteur.')}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="empty-state">
                        <Loader2 size={26} className={running ? 'spin' : ''} />
                        <p>
                          {t(
                            'La stratégie apparaîtra après l’analyse du brief.',
                          )}
                        </p>
                      </div>
                    )}
                  </section>
                  <section className="panel journal">
                    <h2>
                      <Terminal size={18} />
                      {t('Activité')}{' '}
                      {running && (
                        <span className="live-label">{t('En cours')}</span>
                      )}
                    </h2>
                    <div aria-live="polite">
                      {active.events?.map((e, i: number) => (
                        <div className="event" key={i}>
                          <time>
                            {new Date(e.at).toLocaleTimeString(
                              locale === 'en' ? 'en-GB' : 'fr-FR',
                              {
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            )}
                          </time>
                          <span className={'event-dot ' + e.level} />
                          <p>{t(e.message)}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
                <section className="panel sources">
                  <h2>
                    <Link2 size={18} />
                    {t('Sources et exigences')}
                  </h2>
                  {active.sources?.map((s) => (
                    <div key={s.id} id={'source-' + s.id}>
                      <span>{s.id}</span>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title}
                          <ArrowUpRight size={14} />
                        </a>
                      ) : (
                        <strong>{s.title}</strong>
                      )}
                      <small>
                        {s.error ||
                          (s.text?.length || 0) + t(' caractères analysés')}
                      </small>
                      {s.documentId && (
                        <details className="source-excerpt">
                          <summary>
                            {t('Voir le texte extrait')} ·{' '}
                            {s.method === 'ocr' ? 'OCR' : t('Texte extrait')}
                          </summary>
                          <p>{s.text || t('Aucun texte sur cette page.')}</p>
                          {s.warnings?.map((w) => (
                            <small key={w}>{t(warningLabels[w] || w)}</small>
                          ))}
                        </details>
                      )}
                    </div>
                  ))}
                  {active.plan?.criteria.map((r) => (
                    <p className="requirement" key={r.id}>
                      <span>{t('Critère')}</span>
                      {r.label}
                      {r.weight !== null ? ' · ' + r.weight + ' %' : ''}
                      <small>
                        {r.verified ? t('Source vérifiée') : t('À confirmer')} ·{' '}
                        {r.sourceId}
                      </small>
                    </p>
                  ))}
                  {active.plan?.requirements.map((r) => (
                    <p className="requirement" key={r.id}>
                      <span>
                        {r.kind === 'mandatory'
                          ? t('Requis')
                          : r.kind === 'recommended'
                            ? t('Conseillé')
                            : t('À confirmer')}
                      </span>
                      {r.text}
                      <small>{r.sourceId}</small>
                    </p>
                  ))}
                </section>
              </TabsContent>
              <TabsContent value="project">
                {active.files?.length > 0 ? (
                  <>
                    {active.previewUrl && (
                      <>
                        <div className="preview-toolbar">
                          <span>
                            <span className="online-dot" />
                            {t('Aperçu du prototype')}
                          </span>
                          <a
                            href={active.previewUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t('Ouvrir le prototype')}
                            <ArrowUpRight size={15} />
                          </a>
                        </div>
                        <iframe
                          title={t('Prototype généré')}
                          src={active.previewUrl}
                          className="prototype-frame"
                          sandbox="allow-scripts allow-same-origin allow-forms"
                        />
                      </>
                    )}
                    {!!active.artifacts?.length && (
                      <section className="panel artifact-list">
                        <h2>
                          <FileText size={18} />
                          {t('Documents produits')}
                        </h2>
                        {active.artifacts.map((a) => (
                          <article key={a.id}>
                            <h3>{a.title}</h3>
                            <div className="artifact-actions">
                              <Button
                                variant="outline"
                                onClick={() => readFile(a.preview)}
                              >
                                {t('Lire le contenu')}
                              </Button>
                              {a.files
                                .filter((f) => !f.endsWith('.md'))
                                .map((f) => (
                                  <a
                                    className="button-link"
                                    key={f}
                                    href={downloadFile(f)}
                                  >
                                    <Download size={14} />
                                    {f}
                                  </a>
                                ))}
                            </div>
                          </article>
                        ))}
                      </section>
                    )}
                    <section className="panel">
                      <h2>
                        <FileCode2 size={18} />
                        {t('Fichiers du projet')}
                      </h2>
                      <div className="file-browser">
                        <div>
                          {active.files.map((f: string) =>
                            /\.(pdf|pptx|xlsx)$/i.test(f) ? (
                              <a
                                key={f}
                                className="file-download"
                                href={downloadFile(f)}
                              >
                                <Download size={14} />
                                {f}
                              </a>
                            ) : (
                              <button
                                key={f}
                                onClick={() => readFile(f)}
                                className={file?.path === f ? 'active' : ''}
                              >
                                <FileCode2 size={14} />
                                {f}
                              </button>
                            ),
                          )}
                        </div>
                        <pre>
                          {file
                            ? file.content
                            : t(
                                'Sélectionnez un fichier pour lire son contenu.',
                              )}
                        </pre>
                      </div>
                    </section>
                  </>
                ) : (
                  <div className="panel empty-state">
                    <FileCode2 size={32} />
                    <p>
                      {t('Les fichiers apparaîtront après leur production.')}
                    </p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="tests">
                <section className="panel">
                  <h2>
                    <FlaskConical size={18} />
                    {t(
                      webProject
                        ? 'Résultats des tests'
                        : 'Résultats des vérifications',
                    )}
                  </h2>
                  {active.tests ? (
                    <>
                      <p>
                        {t(
                          active.artifacts?.length
                            ? 'Les fichiers sont relus et les calculs recalculés. Le modèle relit la réponse et sa cohérence avec l’énoncé.'
                            : 'Un navigateur ouvre le prototype, exécute les scénarios et contrôle les résultats.',
                        )}
                      </p>
                      {active.tests.results.map((result, i: number) => (
                        <div className="test-row" key={i}>
                          <span
                            className={
                              result.passed ? 'test-pass' : 'test-fail'
                            }
                          >
                            {result.passed ? (
                              <Check size={17} />
                            ) : (
                              <AlertCircle size={17} />
                            )}
                          </span>
                          <div>
                            <strong>{t(result.name)}</strong>
                            <p>{t(result.detail)}</p>
                          </div>
                          <b>{result.passed ? t('Réussi') : t('Échec')}</b>
                        </div>
                      ))}
                      {active.tests.screenshot && (
                        <Image
                          unoptimized
                          width={1440}
                          height={1000}
                          className="test-screenshot"
                          src={'/api/missions/' + active.id + '/screenshot'}
                          alt={t(
                            'Capture du prototype lors du test automatique',
                          )}
                        />
                      )}
                    </>
                  ) : (
                    <div className="empty-state">
                      <FlaskConical size={30} />
                      <p>
                        {t(
                          'Les vérifications démarrent dès que les livrables sont prêts.',
                        )}
                      </p>
                    </div>
                  )}
                </section>
                {active.review && (
                  <section className="panel">
                    <h2>{t('Analyse du résultat')}</h2>
                    <p>{active.review.summary}</p>
                    {active.review.gaps.map((g: string, i: number) => (
                      <p className="unknown" key={i}>
                        <AlertCircle size={15} />
                        {g}
                      </p>
                    ))}
                  </section>
                )}
              </TabsContent>
              <TabsContent value="submission">
                <section className="panel submission">
                  <h2>
                    <FolderOpen size={18} />
                    {t('Livrables')}
                  </h2>
                  {active.submission ? (
                    <>
                      {webProject && (
                        <div className="notice">
                          <AlertCircle size={17} />
                          {t(
                            'Le prototype est local. L’hébergement public, la vidéo et la soumission en compétition restent à réaliser.',
                          )}
                        </div>
                      )}
                      <pre>{active.submission}</pre>
                    </>
                  ) : (
                    <div className="empty-state">
                      <FolderOpen size={30} />
                      <p>
                        {t('Le dossier sera assemblé après les vérifications.')}
                      </p>
                    </div>
                  )}
                </section>
              </TabsContent>
            </Tabs>
          </div>
        )}
        <footer className="workspace-footer">
          <span>HackPilot</span>
          <span>{t('Espace de travail local')}</span>
        </footer>
      </main>
    </SidebarProvider>
  );
}
