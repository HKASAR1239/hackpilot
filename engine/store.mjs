import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { englishMessage } from './english.mjs';
import { randomUUID } from 'node:crypto';
export class Store {
  constructor(root) {
    this.root = root;
    this.items = new Map();
    this.queue = new Map();
  }
  async init() {
    await mkdir(this.root, { recursive: true });
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const m = JSON.parse(
          await readFile(join(this.root, entry.name, 'mission.json'), 'utf8'),
        );
        if (!m.id || m.id !== entry.name) continue;
        this.items.set(m.id, m);
        if (['running', 'queued'].includes(m.status)) {
          m.status = 'interrupted';
          m.error =
            'Le moteur a été arrêté. La mission peut reprendre depuis le dernier résultat enregistré.';
          await this.save(m);
        }
      } catch {
        /* Incomplete temporary directory; never corrupt other missions. */
      }
    }
  }
  dir(id) {
    if (!this.items.has(id))
      throw Object.assign(new Error('Mission introuvable.'), { status: 404 });
    return join(this.root, id);
  }
  get(id) {
    const m = this.items.get(id);
    if (!m)
      throw Object.assign(new Error('Mission introuvable.'), { status: 404 });
    return m;
  }
  list() {
    return [...this.items.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ id, name, status, provider, createdAt }) => ({
        id,
        name,
        status,
        provider,
        createdAt,
      }));
  }
  async create(input) {
    const m = {
      id: randomUUID(),
      name: input.locale === 'en' ? 'New project' : 'Nouvelle mission',
      createdAt: new Date().toISOString(),
      status: 'queued',
      provider: input.provider,
      input,
      events: [],
      stages: [
        'Sources',
        'Stratégie',
        'Construction',
        'Vérification',
        'Livraison',
      ].map((name) => ({ name, status: 'pending' })),
      sources: [],
      files: [],
      repairs: 0,
      usage: { input: 0, output: 0, calls: 0 },
    };
    this.items.set(m.id, m);
    await this.save(m);
    return m;
  }
  async save(m) {
    m.updatedAt = new Date().toISOString();
    const data = JSON.stringify(m, null, 2);
    const prior = this.queue.get(m.id) || Promise.resolve();
    const next = prior
      .catch(() => {})
      .then(async () => {
        const dir = this.dir(m.id);
        await mkdir(dir, { recursive: true });
        const temp = join(dir, 'mission.json.tmp');
        await writeFile(temp, data, { mode: 0o600 });
        await rename(temp, join(dir, 'mission.json'));
      });
    this.queue.set(m.id, next);
    await next;
  }
  async event(m, message, level = 'info') {
    m.events.push({
      at: new Date().toISOString(),
      message: m.input.locale === 'en' ? englishMessage(message) : message,
      level,
    });
    await this.save(m);
  }
}
