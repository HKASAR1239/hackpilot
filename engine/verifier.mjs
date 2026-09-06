import { validateBrowserTests } from './schema.mjs';
import { chromium } from 'playwright';
import { join } from 'node:path';
export async function verify({ url, tests, dir, signal }) {
  validateBrowserTests(tests);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const runtimeErrors = [];
  const abort = () => browser.close().catch(() => {});
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw new Error('Vérification interrompue.');
    const origin = new URL(url).origin;
    async function context() {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 820 },
        serviceWorkers: 'block',
      });
      await ctx.route('**/*', (route) => {
        const u = route.request().url();
        try {
          return new URL(u).origin === origin
            ? route.continue()
            : route.abort();
        } catch {
          return route.abort();
        }
      });
      await ctx.addInitScript(() => {
        window.__hackpilotStorageMode = 'normal';
        for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
          const original = Storage.prototype[method];
          Storage.prototype[method] = function (...args) {
            const mode = window.__hackpilotStorageMode;
            if (
              mode === 'unavailable' ||
              (mode === 'read-failure' && method === 'getItem') ||
              (mode === 'write-failure' && method !== 'getItem')
            )
              throw new DOMException(
                'Storage failure simulated by the verifier.',
                'QuotaExceededError',
              );
            return original.apply(this, args);
          };
        }
      });
      return ctx;
    }
    const ctx = await context(),
      page = await ctx.newPage();
    page.on('pageerror', (e) => runtimeErrors.push(e.message));
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });
    const text = (await page.locator('body').innerText()).trim();
    const title = await page.title();
    const controls = await page.locator('button,input,select,textarea').count();
    const loaded = !!(
      response?.ok() &&
      title &&
      text.length > 60 &&
      controls > 0
    );
    results.push({
      name: 'Le prototype s’ouvre et propose des interactions',
      passed: loaded,
      detail: loaded
        ? 'Page HTTP accessible, titre, contenu et contrôles détectés.'
        : 'Page incomplète ou non interactive.',
    });
    await page.screenshot({
      path: join(dir, 'screenshot.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    results.push({
      name: 'Le prototype tient dans un écran mobile',
      passed: !overflow,
      detail: overflow
        ? 'Un débordement horizontal a été détecté à 390 px.'
        : 'Aucun débordement horizontal à 390 px.',
    });
    await ctx.close();
    for (const test of tests) {
      if (signal?.aborted) throw new Error('Vérification interrompue.');
      const c = await context(),
        p = await c.newPage();
      p.setDefaultTimeout(6000);
      p.on('pageerror', (e) => runtimeErrors.push(e.message));
      try {
        await p.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        for (const step of test.steps) {
          if (signal?.aborted) throw new Error('Vérification interrompue.');
          if (step.action === 'reload') {
            await p.reload({ waitUntil: 'networkidle' });
            continue;
          }
          if (step.action === 'storageMode') {
            await p.evaluate((value) => {
              window.__hackpilotStorageMode = value;
            }, step.value);
            continue;
          }
          const loc = p.locator(step.selector);
          if (step.action === 'fill') await loc.fill(step.value);
          else if (step.action === 'click') await loc.click();
          else if (step.action === 'select') await loc.selectOption(step.value);
          else if (step.action === 'check') await loc.check();
          else if (step.action === 'uncheck') await loc.uncheck();
          else if (step.action === 'assertDisabled') {
            if (!(await loc.isDisabled()))
              throw new Error('Expected a disabled control: ' + step.selector);
          } else if (step.action === 'assertValue') {
            if ((await loc.inputValue()) !== step.value)
              throw new Error('Unexpected field value: ' + step.selector);
          } else if (step.action === 'assertHidden')
            await loc.waitFor({ state: 'hidden' });
          else if (step.action === 'assertVisible')
            await loc.waitFor({ state: 'visible' });
          else if (step.action === 'assertText') {
            await loc.waitFor({ state: 'visible' });
            const started = Date.now();
            let found = false;
            while (Date.now() - started < 5000) {
              if ((await loc.innerText()).includes(step.value)) {
                found = true;
                break;
              }
              await new Promise((r) => setTimeout(r, 100));
            }
            if (!found) throw new Error('Texte attendu absent : ' + step.value);
          }
        }
        results.push({
          name: test.name,
          passed: true,
          evidence: { steps: test.steps },
          detail:
            test.steps.length + ' étapes exécutées, assertions vérifiées.',
        });
      } catch (e) {
        results.push({
          name: test.name,
          passed: false,
          detail: e.message.slice(0, 600),
        });
      } finally {
        await c.close();
      }
    }
    results.push({
      name: 'Aucune erreur JavaScript pendant les parcours',
      passed: runtimeErrors.length === 0,
      detail: runtimeErrors.length
        ? runtimeErrors.slice(0, 5).join('\n')
        : 'Aucune exception JavaScript observée.',
    });
    return {
      at: new Date().toISOString(),
      results,
      passed: results.every((r) => r.passed),
      screenshot: true,
    };
  } finally {
    signal?.removeEventListener('abort', abort);
    await browser.close();
  }
}
