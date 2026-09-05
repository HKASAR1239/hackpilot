import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
export function isPublicIP(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a === 198
    );
  }
  if (isIP(ip) === 6) {
    const n = ip.toLowerCase();
    return n.startsWith('2') || n.startsWith('3');
  }
  return false;
}
export async function validatePublicURL(value, resolver = lookup) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new Error('URL invalide.');
  }
  if (
    !['http:', 'https:'].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !['80', '443'].includes(u.port))
  )
    throw new Error(
      'Seules les pages web publiques HTTP/HTTPS sont acceptées.',
    );
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const ips = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await resolver(host, { all: true });
  if (!ips.length || ips.some((x) => !isPublicIP(x.address)))
    throw new Error('Cette adresse ne désigne pas une page publique.');
  return { url: u, address: ips[0] };
}
export async function fetchPage(value, signal, redirects = 0) {
  if (redirects > 4) throw new Error('Trop de redirections.');
  const { url, address } = await validatePublicURL(value);
  const result = await new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).get(
      url,
      {
        signal,
        timeout: 15000,
        headers: {
          'User-Agent': 'HackPilot/0.1 (hackathon brief reader)',
          Accept: 'text/html,text/plain',
        },
        lookup: (_host, options, cb) =>
          options?.all
            ? cb(null, [address])
            : cb(null, address.address, address.family),
      },
      (res) => {
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          res.resume();
          resolve({ redirect: new URL(res.headers.location, url).href });
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error('La source répond HTTP ' + res.statusCode));
          return;
        }
        const type = String(res.headers['content-type'] || '');
        if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
          res.resume();
          reject(
            new Error(
              'Format de source non pris en charge : utilisez le texte du brief.',
            ),
          );
          return;
        }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > 1500000) {
            req.destroy(new Error('La page dépasse la taille autorisée.'));
          } else chunks.push(c);
        });
        res.on('end', () =>
          resolve({
            html: Buffer.concat(chunks).toString('utf8'),
            url: url.href,
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () =>
      req.destroy(new Error('Délai de lecture de la source dépassé.')),
    );
  });
  if (result.redirect) return fetchPage(result.redirect, signal, redirects + 1);
  return result;
}
export function htmlText(html) {
  return html
    .replace(/<(script|style|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24000);
}
export async function collectSources(input, signal) {
  const out = [];
  if (input.brief?.trim())
    out.push({
      id: 'S1',
      title: 'Brief fourni',
      url: null,
      text: input.brief.trim(),
      retrievedAt: new Date().toISOString(),
    });
  if (input.url) {
    try {
      const first = await fetchPage(input.url, signal);
      out.push({
        id: 'S' + (out.length + 1),
        title: (
          first.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
          new URL(first.url).hostname
        ).replace(/&amp;/g, '&'),
        url: first.url,
        text: htmlText(first.html),
        retrievedAt: new Date().toISOString(),
      });
      const links = [...first.html.matchAll(/href=["']([^"']+)["']/gi)]
        .map((m) => {
          try {
            return new URL(m[1], first.url);
          } catch {
            return null;
          }
        })
        .filter(
          (u) =>
            u &&
            u.origin === new URL(first.url).origin &&
            /\/(rules|resources|updates|prizes)\/?$/.test(u.pathname),
        );
      for (const link of [...new Set(links.map((u) => u.href))].slice(0, 3)) {
        try {
          const page = await fetchPage(link, signal);
          out.push({
            id: 'S' + (out.length + 1),
            title: new URL(page.url).pathname,
            url: page.url,
            text: htmlText(page.html),
            retrievedAt: new Date().toISOString(),
          });
        } catch (e) {
          if (signal?.aborted) throw e;
          out.push({
            id: 'S' + (out.length + 1),
            title: link,
            url: link,
            text: '',
            error: e.message,
          });
        }
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      out.push({
        id: 'S' + (out.length + 1),
        title: input.url,
        url: input.url,
        text: '',
        error: e.message,
      });
    }
  }
  for (const document of input.documents || []) {
    for (const page of document.pages)
      out.push({
        id: 'S' + (out.length + 1),
        title:
          document.name +
          ' · ' +
          (document.format === 'pptx' ? 'slide ' : 'page ') +
          page.number,
        url: null,
        text: page.text,
        documentId: document.id,
        fileName: document.name,
        page: page.number,
        sha256: document.sha256,
        method: page.method,
        retrievedAt: document.createdAt,
        warnings: document.warnings,
      });
  }
  if (out.reduce((length, s) => length + s.text.length, 0) < 30)
    throw new Error(
      'Impossible de lire un brief exploitable. Collez son texte si la page bloque la lecture.',
    );
  return out;
}
