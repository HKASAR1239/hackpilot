import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizePlan, validateBundle, parseJSON } from '../engine/schema.mjs';
import { fixturePlan, fixtureBundle } from '../engine/fixture.mjs';
import { isPublicIP, validatePublicURL, htmlText } from '../engine/sources.mjs';
import { Store } from '../engine/store.mjs';
import { safeRead } from '../engine/server.mjs';
test('classe les concepts selon une heuristique explicite', () => {
  const p = normalizePlan(fixturePlan(), []);
  assert.equal(p.selectedId, 'collecte');
  assert.equal(p.ideas[0].score, 4.7);
});
test('une citation non présente ne devient pas une règle vérifiée', () => {
  const p = fixturePlan();
  p.requirements = [
    {
      id: 'r1',
      text: 'Utiliser une API',
      kind: 'mandatory',
      sourceId: 'S1',
      quote: 'citation inventée',
    },
  ];
  p.criteria = [
    {
      id: 'c1',
      label: 'Design',
      weight: 80,
      sourceId: 'S1',
      quote: 'citation inventée',
    },
  ];
  const result = normalizePlan(p, [
    { id: 'S1', text: 'Vidéo de trois minutes maximum.' },
  ]);
  assert.equal(result.requirements[0].kind, 'unknown');
  assert.equal(result.criteria[0].weight, null);
  assert.equal(result.requirements[0].verified, false);
});
test('vérifie les citations avec les espaces normalisés', () => {
  const p = fixturePlan();
  p.requirements = [
    {
      id: 'r',
      text: 'Vidéo',
      kind: 'mandatory',
      sourceId: 'S1',
      quote: 'vidéo de trois minutes',
    },
  ];
  assert.equal(
    normalizePlan(p, [
      { id: 'S1', text: 'Une vidéo  de trois minutes maximum.' },
    ]).requirements[0].verified,
    true,
  );
});
test('refuse les notes hors limites et les identifiants dupliqués', () => {
  const p = fixturePlan();
  p.ideas[0].fit = 99;
  assert.throws(() => normalizePlan(p, []));
  p.ideas[0].fit = 5;
  p.ideas[0].id = p.ideas[1].id;
  assert.throws(() => normalizePlan(p, []));
});
test('le bundle contient une interface et des tests avec assertions', () => {
  assert.equal(validateBundle(fixtureBundle()).files.length, 4);
  const b = fixtureBundle();
  b.tests[0].steps = [{ action: 'click', selector: 'button', value: '' }];
  assert.throws(() => validateBundle(b), /résultat observable/);
});
test('refuse les chemins sortant du projet et les fichiers exécutables système', () => {
  for (const path of [
    '../secret.txt',
    '/tmp/x.js',
    'app/../../x.js',
    'a\\b.js',
    '.env',
    'run.sh',
    'a//b.js',
  ]) {
    const b = fixtureBundle();
    b.files.push({ path, content: 'x' });
    assert.throws(() => validateBundle(b), /refusé/);
  }
  const b = fixtureBundle();
  b.files.push({ ...b.files[0] });
  assert.throws(() => validateBundle(b), /dupliqué/);
});
test('refuse les formats de sortie invalides', () => {
  assert.deepEqual(parseJSON('{"a":1}'), { a: 1 });
  assert.throws(() => parseJSON('not JSON'));
});
test('les sources doivent être publiques, y compris après résolution DNS', async () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.2.3',
    '192.168.1.1',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
  ])
    assert.equal(isPublicIP(ip), false, ip);
  assert.equal(isPublicIP('93.184.216.34'), true);
  for (const u of [
    'file:///etc/passwd',
    'http://localhost',
    'https://a:b@example.org',
    'https://example.org:8080',
  ])
    await assert.rejects(
      validatePublicURL(u, async () => [{ address: '127.0.0.1', family: 4 }]),
    );
  await assert.rejects(
    validatePublicURL('https://example.org', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]),
  );
});
test('la lecture HTML enlève scripts et menus', () => {
  assert.equal(
    htmlText(
      '<nav>menu</nav><script>bad()</script><h1>Projet &amp; règles</h1>',
    ),
    'Projet & règles',
  );
});
test('l’état persiste et une exécution interrompue devient reprenable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-store-'));
  try {
    const first = new Store(dir);
    await first.init();
    const m = await first.create({ provider: 'demo' });
    m.status = 'running';
    await first.save(m);
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => first.event(m, 'event ' + i)),
    );
    const next = new Store(dir);
    await next.init();
    assert.equal(next.get(m.id).status, 'interrupted');
    assert.equal(next.get(m.id).events.length, 8);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('la lecture de fichiers ne suit pas les liens hors du projet', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-path-'));
  try {
    await mkdir(join(dir, 'project'));
    await writeFile(join(dir, 'private.txt'), 'private');
    await writeFile(join(dir, 'project', 'index.html'), 'ok');
    await symlink(join(dir, 'private.txt'), join(dir, 'project', 'leak.txt'));
    assert.equal(
      (await safeRead(join(dir, 'project'), 'index.html')).toString(),
      'ok',
    );
    await assert.rejects(safeRead(join(dir, 'project'), '../private.txt'));
    await assert.rejects(safeRead(join(dir, 'project'), 'leak.txt'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
