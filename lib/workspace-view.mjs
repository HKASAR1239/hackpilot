export const WORKSPACE_KEY = 'hackpilot-workspace-view';
const tabs = ['overview', 'project', 'tests', 'submission'];
const idPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function normalizeWorkspaceView(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (
    raw.missionId !== null &&
    (typeof raw.missionId !== 'string' || !idPattern.test(raw.missionId))
  )
    return null;
  const file = raw.filePath;
  const safeFile =
    typeof file === 'string' &&
    file.length <= 512 &&
    !file.startsWith('/') &&
    !file.includes('\\') &&
    !file.split('/').some((part) => !part || part === '.' || part === '..');
  return {
    missionId: raw.missionId,
    tab: tabs.includes(raw.tab) ? raw.tab : 'overview',
    filePath: raw.missionId && safeFile ? file : null,
    sourceFilesOpen: !!raw.missionId && raw.sourceFilesOpen === true,
  };
}

export function parseWorkspaceHash(hash) {
  if (hash === '#new') return normalizeWorkspaceView({ missionId: null });
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has('project')) return null;
  return normalizeWorkspaceView({
    missionId: params.get('project'),
    tab: params.get('tab'),
    filePath: params.get('file'),
    sourceFilesOpen: params.get('sources') === 'open',
  });
}

export function workspaceHash(view) {
  if (!view.missionId) return '#new';
  const params = new URLSearchParams({
    project: view.missionId,
    tab: view.tab,
  });
  if (view.filePath) params.set('file', view.filePath);
  if (view.sourceFilesOpen) params.set('sources', 'open');
  return '#' + params.toString();
}

export function readWorkspaceView() {
  const fromUrl = parseWorkspaceHash(window.location.hash);
  if (fromUrl) return fromUrl;
  try {
    return normalizeWorkspaceView(
      JSON.parse(localStorage.getItem(WORKSPACE_KEY)),
    );
  } catch {
    return null;
  }
}

export function rememberWorkspaceView(view) {
  const normalized = normalizeWorkspaceView(view);
  if (!normalized) return;
  // The URL preserves this tab's view even when browser storage is unavailable.
  const hash = workspaceHash(normalized);
  if (window.location.hash !== hash) {
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search + hash,
    );
  }
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(normalized));
  } catch {
    // Project files remain on disk; the URL still restores the open project.
  }
}
