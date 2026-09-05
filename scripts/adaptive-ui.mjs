import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { unzipSync, strFromU8 } from 'fflate';
import { createApp } from '../engine/server.mjs';
import {
  adaptiveResponder,
  adaptiveBrief,
} from '../tests/adaptive-fixture.mjs';

const dir = await mkdtemp(join(tmpdir(), 'hp-adaptive-ui-'));
const app = await createApp({
  dataDir: dir,
  port: 0,
  previewPort: 0,
  production: true,
  runnerOptions: { generate: adaptiveResponder() },
});
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const origin = `http://127.0.0.1:${app.port}`;
try {
  await page.goto(origin);
  await page.locator('#language').selectOption('en');
  await page.locator('#hours').fill('0.5');
  await page.reload();
  assert.equal(await page.locator('#hours').inputValue(), '0.5');
  const m = await app.store.create({
    brief: adaptiveBrief,
    url: '',
    hours: 2,
    callBudget: 24,
    locale: 'en',
    provider: 'codex',
    workflowVersion: 2,
  });
  await app.runner.start(m.id);
  while (app.runner.running.size) await new Promise((r) => setTimeout(r, 20));
  assert.equal(m.status, 'completed', m.error);
  await page.goto(origin + '/#project=' + m.id + '&tab=control');
  await page
    .getByRole('heading', { name: 'Rubric and assessment', exact: true })
    .waitFor();
  assert.equal(await page.locator('.rubric-item').count(), 2);
  assert.match(await page.locator('.rubric-list').innerText(), /70/);
  assert.ok(m.lastVerified.complete);
  await page.locator('#contribution-author').fill('Teammate');
  await page
    .locator('#contribution-text')
    .fill('Could we make the input labels clearer for volunteers?');
  await page.reload();
  assert.match(
    await page.locator('#contribution-text').inputValue(),
    /volunteers/,
  );
  await page
    .getByRole('button', { name: 'Submit suggestion', exact: true })
    .click();
  await page.getByText('Received', { exact: true }).waitFor();
  assert.equal(m.contributions.length, 1);
  assert.equal(await page.locator('#contribution-text').inputValue(), '');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByText('Not retained', { exact: true }).waitFor();
  assert.equal(m.contributions[0].status, 'rejected');
  const zipResponse = await fetch(
    origin + '/api/missions/' + m.id + '/verified-export',
  );
  const zip = unzipSync(new Uint8Array(await zipResponse.arrayBuffer()));
  assert.ok(zip['index.html']);
  assert.ok(zip['hackpilot/version.json']);
  assert.equal(
    JSON.parse(strFromU8(zip['hackpilot/version.json'])).complete,
    true,
  );
  assert.equal(
    zip['hackpilot/submission.md'],
    undefined,
    'An older snapshot must not inherit current metadata.',
  );
  const previous = m.verifiedVersions[0];
  await page.locator('#saved-version').selectOption(previous.id);
  const history = await fetch(
    origin +
      '/api/missions/' +
      m.id +
      '/verified-export?version=' +
      previous.id,
  );
  assert.equal(history.status, 200);
  const oldZip = unzipSync(new Uint8Array(await history.arrayBuffer()));
  assert.equal(
    JSON.parse(strFromU8(oldZip['hackpilot/version.json'])).id,
    previous.id,
  );
  assert.equal(
    (
      await fetch(
        origin + '/api/missions/' + m.id + '/verified-export?version=missing',
      )
    ).status,
    404,
  );
  await page.getByText('Change deadline', { exact: true }).click();
  const deadline = new Date(Date.now() + 4 * 3600000);
  const local = new Date(
    deadline.getTime() - deadline.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
  await page.locator('#project-deadline').fill(local);
  await page
    .getByRole('button', { name: 'Save deadline', exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector('#project-deadline')?.value === '',
  );
  assert.equal(m.schedule.deadlineChanges.length, 1);
  await mkdir('validation', { recursive: true });
  await page.screenshot({
    path: 'validation/adaptive-desktop-en.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'No horizontal mobile overflow.',
  );
  await page.locator('#language').selectOption('fr');
  await page
    .getByRole('heading', { name: 'Contributions de l’équipe', exact: true })
    .waitFor();
  await page.screenshot({
    path: 'validation/adaptive-mobile-fr.png',
    fullPage: true,
  });
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Storage.prototype,
      'setItem',
    );
    const original = descriptor.value;
    window.restoreContributionStorage = () => {
      Object.defineProperty(Storage.prototype, 'setItem', descriptor);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('hackpilot-contribution-'))
        throw new DOMException('Full', 'QuotaExceededError');
      return Reflect.apply(original, this, [key, value]);
    };
  });
  await page
    .locator('#contribution-text')
    .fill('Keep this editable draft when browser storage is full.');
  assert.equal(
    await page.locator('#contribution-text').inputValue(),
    'Keep this editable draft when browser storage is full.',
  );
  await page.evaluate(() => window.restoreContributionStorage());
  let releaseResponse;
  const pendingResponse = new Promise((resolve) => {
    releaseResponse = resolve;
  });
  await page.route(
    '**/api/missions/' + m.id + '/contributions',
    async (route) => {
      const response = await route.fetch();
      await pendingResponse;
      await route.fulfill({ response });
    },
  );
  await page
    .locator('#contribution-text')
    .fill('Submission awaiting confirmation.');
  await page.locator('.contribution-submit button').click();
  assert.equal(await page.locator('#contribution-text').isDisabled(), true);
  const sibling = await page.context().newPage();
  await sibling.goto(origin);
  await sibling.evaluate((id) => {
    const key = 'hackpilot-contribution-' + id;
    const draft = JSON.parse(localStorage.getItem(key));
    localStorage.setItem(
      key,
      JSON.stringify({
        ...draft,
        text: 'New draft from another tab must survive the earlier response.',
        requestId: crypto.randomUUID(),
      }),
    );
  }, m.id);
  releaseResponse();
  await page.waitForFunction(
    () => !document.querySelector('#contribution-text').disabled,
  );
  assert.equal(
    await page.locator('#contribution-text').inputValue(),
    'New draft from another tab must survive the earlier response.',
  );
  await sibling.close();
  assert.deepEqual(errors, []);
  console.log(
    'Adaptive UI passed: 30-minute draft, rubric, source weights, persisted contribution draft, submit, resume, decision, isolated checked export, explicit deadline change, FR/EN, reload and mobile layout.',
  );
} finally {
  await browser.close();
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
