'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type {
  Mission,
  MissionSummary,
  Health,
  UploadedDocument,
} from '@/lib/types';
import { useLanguage } from '@/lib/language';
import { useProjectDraft } from '@/lib/use-project-draft';
import { emptyDraft } from '@/lib/project-draft.mjs';
import {
  readWorkspaceView,
  rememberWorkspaceView,
} from '@/lib/workspace-view.mjs';
import { RunProgress } from '@/components/run-progress';
import { QualityEvidence } from '@/components/quality-evidence';
import {
  AdaptiveWorkspace,
  ScheduleSummary,
} from '@/components/adaptive-workspace';
import { DocumentUpload, warningLabels } from '@/components/document-upload';
import {
  ArrowUpRight,
  ArrowRight,
  Play,
  Plus,
  Terminal,
  Check,
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
  Search,
  ChevronDown,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Sidebar, SidebarProvider } from '@/components/ui/sidebar';
const statuses: Record<string, string> = {
  queued: 'En attente',
  running: 'En cours',
  completed: 'Prototype vérifié',
  failed: 'À reprendre',
  cancelled: 'Arrêtée',
  interrupted: 'Interrompue',
  paused: 'Jalon atteint',
  expired: 'Échéance atteinte',
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
  const {
    draft,
    update,
    ready: draftReady,
    saved,
    storageAvailable,
    expired,
    dismissExpired,
  } = useProjectDraft();
  const { brief, url, hours, provider, documents } = draft;
  const [uploading, setUploading] = useState(false);
  const [undoDraft, setUndoDraft] = useState<typeof draft | null>(null);
  function editDraft(patch: Partial<typeof draft>) {
    setUndoDraft(null);
    update(patch);
  }
  const setBrief = (brief: string) => editDraft({ brief });
  const setUrl = (url: string) => editDraft({ url });
  const setHours = (hours: string) => editDraft({ hours });
  const setProvider = (provider: string) => editDraft({ provider });
  const setDocuments = (documents: UploadedDocument[]) =>
    editDraft({ documents });
  const [projectQuery, setProjectQuery] = useState('');
  const [mobileProjectsOpen, setMobileProjectsOpen] = useState(false);
  const [sourceFilesOpen, setSourceFilesOpen] = useState(false);
  const previousRun = useRef<{ id: string; status: string } | null>(null);
  const requestSequence = useRef(0);
  const [missions, setMissions] = useState<MissionSummary[]>([]),
    [active, setActive] = useState<Mission | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [tab, setTab] = useState('overview');
  const [file, setFile] = useState<{
    path: string;
    content: string;
  } | null>(null);
  async function refresh(id?: string, open = false) {
    const sequence = ++requestSequence.current;
    const list = await api<MissionSummary[]>('/missions');
    if (sequence !== requestSequence.current) return;
    setMissions(list);
    if (id) {
      const mission = await api<Mission>('/missions/' + id);
      if (sequence !== requestSequence.current) return;
      setActive(mission);
      if (open) setTab(mission.status === 'completed' ? 'project' : 'overview');
    }
  }
  useEffect(() => {
    api<Health>('/health')
      .then(setHealth)
      .catch(() =>
        setError(t('Le moteur local est indisponible. Relancez HackPilot.')),
      );
  }, [t]);
  useEffect(() => {
    let cancelled = false;
    async function restoreWorkspace() {
      const sequence = ++requestSequence.current;
      const savedView = readWorkspaceView();
      const list = await api<MissionSummary[]>('/missions');
      const id = savedView
        ? savedView.missionId
        : list.find((m) => ['running', 'queued'].includes(m.status))?.id;
      const exists = id && list.some((m) => m.id === id);
      const mission = exists ? await api<Mission>('/missions/' + id) : null;
      let selectedFile: { path: string; content: string } | null = null;
      if (
        mission &&
        savedView?.filePath &&
        mission.files.includes(savedView.filePath)
      ) {
        selectedFile = await api<{ path: string; content: string }>(
          '/missions/' +
            mission.id +
            '/file?path=' +
            encodeURIComponent(savedView.filePath),
        );
      }
      if (cancelled || sequence !== requestSequence.current) return;
      setMissions(list);
      setActive(mission);
      setTab(
        savedView?.tab ||
          (mission?.status === 'completed' ? 'project' : 'overview'),
      );
      setFile(selectedFile);
      setSourceFilesOpen(savedView?.sourceFilesOpen || false);
      if (id && !exists)
        setError(
          'Le projet enregistré n’est plus disponible. Votre brouillon est conservé.',
        );
      setWorkspaceReady(true);
    }
    const failed = (e: unknown) => {
      if (!cancelled) setError(message(e));
    };
    const navigate = () => {
      setWorkspaceReady(false);
      setError('');
      restoreWorkspace().catch(failed);
    };
    restoreWorkspace().catch(failed);
    window.addEventListener('hashchange', navigate);
    window.addEventListener('popstate', navigate);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', navigate);
      window.removeEventListener('popstate', navigate);
    };
  }, []);
  const activeId = active?.id,
    activeStatus = active?.status;
  const runningMission = missions.find((m) =>
    ['running', 'queued'].includes(m.status),
  );
  const runningMissionId = runningMission?.id;
  useEffect(() => {
    if (!workspaceReady) return;
    rememberWorkspaceView({
      missionId: activeId || null,
      tab,
      filePath: file?.path || null,
      sourceFilesOpen,
    });
  }, [workspaceReady, activeId, tab, file?.path, sourceFilesOpen]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeId]);
  useEffect(() => {
    if (
      !workspaceReady ||
      !runningMissionId ||
      ['running', 'queued'].includes(activeStatus || '')
    )
      return;
    const timer = setInterval(() => {
      api<MissionSummary[]>('/missions')
        .then(setMissions)
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [workspaceReady, runningMissionId, activeStatus]);
  useEffect(() => {
    const previous = previousRun.current;
    if (
      activeId &&
      previous?.id === activeId &&
      ['running', 'queued'].includes(previous.status) &&
      activeStatus === 'completed' &&
      tab === 'overview'
    ) {
      setTab('project');
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    previousRun.current =
      activeId && activeStatus ? { id: activeId, status: activeStatus } : null;
  }, [activeId, activeStatus, tab]);
  useEffect(() => {
    if (
      !workspaceReady ||
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
  }, [workspaceReady, activeId, activeStatus]);
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
          callBudget: Number(draft.callBudget || '24'),
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
    setSourceFilesOpen(true);
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
  const hasDraft = !!(brief.trim() || url.trim() || documents.length);
  const filteredMissions = missions.filter((m) =>
    m.name
      .toLocaleLowerCase()
      .includes(projectQuery.trim().toLocaleLowerCase()),
  );
  useEffect(() => {
    if (file && tab === 'project' && sourceFilesOpen)
      document
        .getElementById('file-reader')
        ?.scrollIntoView({ block: 'nearest' });
  }, [file, tab, sourceFilesOpen]);
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
          disabled={!workspaceReady}
          onClick={() => {
            requestSequence.current++;
            setMobileProjectsOpen(false);
            setActive(null);
            setFile(null);
            setSourceFilesOpen(false);
            setError('');
          }}
        >
          <Plus size={17} />
          {t('Nouveau projet')}
        </Button>
        <button
          className="mobile-projects-toggle"
          aria-expanded={mobileProjectsOpen}
          aria-controls="project-navigation"
          onClick={() => setMobileProjectsOpen(!mobileProjectsOpen)}
        >
          <FolderOpen size={16} /> {t('Projets')} <span>{missions.length}</span>
          <ChevronDown size={15} />
        </button>
        <div
          className="project-navigation"
          id="project-navigation"
          data-open={mobileProjectsOpen}
        >
          <div className="project-list-heading">
            {t('Projets')}
            <span>{missions.length}</span>
          </div>
          {missions.length > 0 && (
            <div className="project-search">
              <Search size={15} />
              <input
                type="search"
                aria-label={t('Rechercher un projet')}
                placeholder={t('Rechercher un projet')}
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
              />
            </div>
          )}
          <nav className="mission-nav" aria-label={t('Projets')}>
            {missions.length === 0 ? (
              <p className="nav-empty">{t('Vos projets apparaîtront ici.')}</p>
            ) : (
              filteredMissions.map((m) => (
                <button
                  key={m.id}
                  title={m.name}
                  aria-current={active?.id === m.id ? 'page' : undefined}
                  className={
                    'mission-link ' + (active?.id === m.id ? 'selected' : '')
                  }
                  onClick={() => {
                    setFile(null);
                    setSourceFilesOpen(false);
                    setMobileProjectsOpen(false);
                    refresh(m.id, true).catch((e) => setError(e.message));
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
                        m.status === 'completed'
                          ? 'Terminé'
                          : statuses[m.status],
                      )}
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))
            )}
            {missions.length > 0 && filteredMissions.length === 0 && (
              <p className="nav-empty">{t('Aucun projet trouvé.')}</p>
            )}
          </nav>
        </div>
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
        {!workspaceReady ? (
          <div className="launch-layout" aria-live="polite">
            <div className="page-heading">
              <h1>{t('Restauration de votre espace de travail')}</h1>
              <p>{t('Vos projets et votre brouillon sont conservés.')}</p>
              {error ? (
                <Button onClick={() => window.location.reload()}>
                  {t('Réessayer')}
                </Button>
              ) : (
                <Loader2 size={22} className="spin" />
              )}
            </div>
          </div>
        ) : !active ? (
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
              {runningMission && (
                <div className="active-project-notice" aria-live="polite">
                  <Loader2 size={16} className="spin" />
                  <span>{t('Un projet est déjà en cours.')}</span>
                  <button
                    onClick={() =>
                      refresh(runningMission.id, true).catch((e) =>
                        setError(e.message),
                      )
                    }
                  >
                    {t('Voir la progression')}
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
              <form onSubmit={launch} className="launch-form">
                <div className="form-heading">
                  <h2>{t('Brief du projet')}</h2>
                  <div className="draft-controls">
                    <span className="draft-status" aria-live="polite">
                      {saved && hasDraft ? <Check size={13} /> : null}
                      {t(
                        !storageAvailable
                          ? 'Brouillon non sauvegardé'
                          : hasDraft
                            ? 'Brouillon enregistré'
                            : 'Sauvegarde automatique',
                      )}
                    </span>
                    {hasDraft && (
                      <button
                        type="button"
                        className="draft-reset"
                        disabled={busy || uploading}
                        onClick={() => {
                          setUndoDraft(draft);
                          update(emptyDraft());
                        }}
                        aria-label={t('Effacer le brouillon')}
                      >
                        {t('Effacer')}
                      </button>
                    )}
                  </div>
                </div>
                <fieldset
                  className="form-fields"
                  disabled={busy || !draftReady}
                >
                  {undoDraft && (
                    <div className="draft-feedback" aria-live="polite">
                      {t('Brouillon effacé.')}
                      <button
                        type="button"
                        onClick={() => {
                          update(undoDraft);
                          setUndoDraft(null);
                        }}
                      >
                        {t('Annuler')}
                      </button>
                    </div>
                  )}
                  {expired > 0 && (
                    <div className="draft-feedback" aria-live="polite">
                      {t(
                        'Les documents du brouillon ont expiré. Ajoutez-les de nouveau.',
                      )}
                      <button
                        type="button"
                        onClick={dismissExpired}
                        aria-label={t('Fermer')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <label htmlFor="brief">{t('Objectif et contraintes')}</label>
                  <Textarea
                    id="brief"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder={t(
                      'Précisez les questions à résoudre, les livrables attendus, les données et les critères d’évaluation.',
                    )}
                    rows={5}
                  />
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
                  <DocumentUpload
                    documents={documents}
                    onChange={setDocuments}
                    onBusy={setUploading}
                    disabled={busy}
                  />
                  <div className="setup-options">
                    <div className="duration-field">
                      <label htmlFor="hours">{t('Temps disponible')}</label>
                      <div className="duration-input">
                        <Input
                          id="hours"
                          type="number"
                          min="0.5"
                          step="0.5"
                          max="720"
                          value={hours}
                          onChange={(e) => setHours(e.target.value)}
                        />
                        <span>{t('heures')}</span>
                      </div>
                      <p className="field-help">
                        {t(
                          'De 30 minutes à 30 jours. La deadline est fixée au lancement et conservée à la reprise.',
                        )}
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
                          {provider === 'demo'
                            ? t('Exemple prédéfini')
                            : 'Codex'}
                        </small>
                        <ChevronRight size={15} />
                      </button>
                      <div id="generation-settings" hidden={!settingsOpen}>
                        <label htmlFor="call-budget">
                          {t('Budget d’appels au modèle')}
                        </label>
                        <Input
                          id="call-budget"
                          type="number"
                          min="8"
                          max="72"
                          step="1"
                          value={draft.callBudget || '24'}
                          onChange={(e) =>
                            editDraft({ callBudget: e.target.value })
                          }
                        />
                        <p className="field-help">
                          {t(
                            'Plafond cumulé pour le projet, distinct de la deadline. Les limites de jetons restent applicables.',
                          )}
                        </p>
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
                </fieldset>
                <div className="launch-bottom">
                  <p>
                    <Clock3 size={15} />
                    {t('Traitement adapté au délai')}
                  </p>
                  <Button
                    type="submit"
                    className="launch-button"
                    disabled={
                      busy ||
                      !draftReady ||
                      !!runningMission ||
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
              <div className="autonomy-note">
                <Check size={16} />
                <div>
                  <strong>{t('Un lancement suffit')}</strong>
                  <p>
                    {t(
                      'L’approche, les formats et les corrections sont gérés automatiquement.',
                    )}
                  </p>
                </div>
              </div>
              <p className="scope-note">
                {t(
                  'Les livrables suivent l’énoncé. Un site ou un autre complément peut être ajouté s’il apporte une valeur concrète au sujet.',
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
                ) : ['failed', 'cancelled', 'interrupted', 'paused'].includes(
                    active.status,
                  ) ||
                  (active.status === 'completed' &&
                    active.contributions?.some(
                      (c) => c.status === 'queued',
                    )) ? (
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
            <RunProgress mission={active} />
            <ScheduleSummary mission={active} />
            {active.trial && (
              <output className="control-notice">
                {t(
                  'Une version d’essai est en cours. La version contrôlée précédente reste disponible au téléchargement.',
                )}
              </output>
            )}
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
                {active.workflowVersion === 2 && (
                  <TabsTrigger value="control">{t('Pilotage')}</TabsTrigger>
                )}
                <TabsTrigger value="project">{t('Résultats')}</TabsTrigger>
                <TabsTrigger value="tests">
                  {t(webProject ? 'Tests' : 'Vérifications')}
                </TabsTrigger>
                <TabsTrigger value="submission">
                  {t('Dossier final')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="control">
                <AdaptiveWorkspace
                  key={active.id}
                  mission={active}
                  onChange={() => refresh(active.id)}
                />
              </TabsContent>
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
                <QualityEvidence mission={active} />
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
                      {r.weight !== null
                        ? ' · ' + t('Poids') + ' ' + r.weight
                        : ''}
                      <small>
                        {r.origin === 'internal'
                          ? t('Grille interne')
                          : r.verified
                            ? t('Source vérifiée')
                            : t('À confirmer')}
                        {r.sourceId ? ' · ' + r.sourceId : ''}
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
                {active.status === 'completed' && (
                  <div className="results-summary">
                    <div className="result-check">
                      <Check size={20} />
                    </div>
                    <div>
                      <h2>{t('Vos livrables sont prêts')}</h2>
                      <p>
                        {t(
                          'Téléchargez les fichiers ou consultez leur contenu ci-dessous.',
                        )}
                      </p>
                    </div>
                    {!!active.review?.gaps.length && (
                      <button onClick={() => setTab('tests')}>
                        <AlertCircle size={14} />
                        {active.review.gaps.length} {t('point(s) à relire')}
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                )}
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
                        <div className="artifact-grid">
                          {active.artifacts.map((a) => {
                            const extension =
                              a.kind === 'presentation'
                                ? '.pptx'
                                : a.kind === 'spreadsheet'
                                  ? '.xlsx'
                                  : '.pdf';
                            const primary = a.files.find((path) =>
                              path.endsWith(extension),
                            );
                            const otherFiles = a.files.filter(
                              (path) => path !== primary,
                            );
                            return (
                              <article key={a.id}>
                                <div className="artifact-type">
                                  <FileText size={20} />
                                  <span>
                                    {extension === '.pptx'
                                      ? 'PowerPoint'
                                      : extension === '.xlsx'
                                        ? 'Excel'
                                        : 'PDF'}
                                  </span>
                                </div>
                                <h3>{a.title}</h3>
                                <div className="artifact-actions">
                                  {primary && (
                                    <a
                                      className="button-link"
                                      href={downloadFile(primary)}
                                    >
                                      <Download size={14} />
                                      {primary}
                                    </a>
                                  )}
                                  <Button
                                    variant="outline"
                                    onClick={() => readFile(a.preview)}
                                  >
                                    {t('Lire le contenu')}
                                  </Button>
                                </div>
                                {otherFiles.length > 0 && (
                                  <details className="artifact-formats">
                                    <summary>
                                      {t('Autres formats')}
                                      <ChevronDown size={13} />
                                    </summary>
                                    <div>
                                      {otherFiles.map((path) => (
                                        <a key={path} href={downloadFile(path)}>
                                          <Download size={13} />
                                          {path}
                                        </a>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    )}
                    <details
                      className="panel source-files"
                      id="file-reader"
                      open={sourceFilesOpen}
                      onToggle={(event) =>
                        setSourceFilesOpen(event.currentTarget.open)
                      }
                    >
                      <summary>
                        <FileCode2 size={18} />
                        {t('Fichiers et sources')}
                        <span>
                          {active.files.length} {t('fichiers')}
                        </span>
                        <ChevronDown size={16} />
                      </summary>
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
                    </details>
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
