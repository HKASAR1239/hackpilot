import { Worker } from 'node:worker_threads';
import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  mkdtemp,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
export const MAX_FILE_BYTES = 10 * 1024 * 1024,
  MAX_DOCUMENTS = 3;
export const documentErrors = {
  format: 'Format non pris en charge. Utilisez un PDF, PPTX, PNG ou JPEG.',
  file_size: 'Le fichier dépasse 10 Mo.',
  page_limit: 'Le document dépasse 80 pages.',
  image_size: 'L’image dépasse 16 millions de pixels.',
  no_text:
    'Aucun texte exploitable. Ajoutez un document plus lisible ou collez le brief.',
  password:
    'Le PDF est protégé par un mot de passe. Importez une copie déverrouillée.',
  invalid_document: 'Le document est illisible ou son format est invalide.',
  expanded_limit: 'La présentation dépasse les limites de lecture.',
  document_timeout: 'La lecture a dépassé deux minutes. Réduisez le document.',
  document_busy:
    'Un document est déjà en cours de lecture. Réessayez dans quelques instants.',
  document_missing:
    'Un document a expiré ou est introuvable. Importez-le à nouveau.',
  document_count: 'Trois documents maximum par projet.',
};
export function documentError(code, status = 400) {
  return Object.assign(
    new Error(documentErrors[code] || documentErrors.invalid_document),
    { code, status },
  );
}
export async function extractDocument(data, name, { signal } = {}) {
  const ext = extname(name).slice(1).toLowerCase();
  if (!['pdf', 'pptx', 'png', 'jpg', 'jpeg'].includes(ext))
    throw documentError('format', 415);
  if (!data.length || data.length > MAX_FILE_BYTES)
    throw documentError('file_size', 413);
  const tempDir = await mkdtemp(join(tmpdir(), 'hackpilot-document-'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./document-worker.mjs', import.meta.url),
      {
        workerData: { data: new Uint8Array(data), ext, tempDir },
        execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      },
    );
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      void worker
        .terminate()
        .then(() => rm(tempDir, { recursive: true, force: true }))
        .then(() => {
          if (error) reject(error);
          else resolve(result);
        })
        .catch(reject);
    };
    const abort = () => finish(documentError('document_timeout', 408));
    const timer = setTimeout(abort, 120000);
    worker.once('message', (m) =>
      finish(m.ok ? null : documentError(m.code), m.result),
    );
    worker.once('error', () => finish(documentError('invalid_document')));
    worker.once('exit', () => {
      if (!settled) finish(documentError('invalid_document'));
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
export class Documents {
  constructor(root) {
    this.root = join(root, 'documents');
    this.busy = false;
  }
  async init() {
    await mkdir(this.root, { recursive: true });
    for (const name of await readdir(this.root)) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      try {
        const doc = JSON.parse(await readFile(join(this.root, name), 'utf8'));
        if (Date.now() - Date.parse(doc.createdAt) > 86400000)
          await rm(join(this.root, name));
      } catch {
        /* A malformed draft is ignored. */
      }
    }
  }
  async add(data, filename, options) {
    if (this.busy) throw documentError('document_busy', 409);
    this.busy = true;
    try {
      const name = Array.from(String(filename))
        .map((char) =>
          char.charCodeAt(0) < 32 || '/\\'.includes(char) ? '_' : char,
        )
        .join('')
        .slice(0, 180);
      const extracted = await extractDocument(data, name, options);
      const doc = {
        id: randomUUID(),
        name,
        bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
        createdAt: new Date().toISOString(),
        ...extracted,
      };
      await writeFile(join(this.root, doc.id + '.json'), JSON.stringify(doc), {
        mode: 0o600,
      });
      return doc;
    } finally {
      this.busy = false;
    }
  }
  async get(id) {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))
      throw documentError('document_missing');
    try {
      const doc = JSON.parse(
        await readFile(join(this.root, id + '.json'), 'utf8'),
      );
      if (Date.now() - Date.parse(doc.createdAt) > 86400000)
        throw new Error('expired');
      return doc;
    } catch {
      throw documentError('document_missing');
    }
  }
  async resolve(ids = []) {
    if (
      !Array.isArray(ids) ||
      ids.length > MAX_DOCUMENTS ||
      new Set(ids).size !== ids.length
    )
      throw documentError('document_count');
    return Promise.all(ids.map((id) => this.get(id)));
  }
}
