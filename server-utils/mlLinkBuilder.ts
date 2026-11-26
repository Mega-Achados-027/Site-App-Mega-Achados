import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface MlSessionRecord {
  cookie: string;
  csrfToken: string;
  userAgent: string;
  tag: string;
  verified: boolean;
  updatedAt: string;
  lastVerifiedAt: string | null;
  lastGeneratedShortUrl: string | null;
  lastError: string | null;
}

export interface MlSessionPublicStatus {
  connected: boolean;
  verified: boolean;
  tag: string;
  hasCsrfToken: boolean;
  persistedEncrypted: boolean;
  updatedAt: string | null;
  lastVerifiedAt: string | null;
  lastGeneratedShortUrl: string | null;
  lastError: string | null;
  cachedLinksCount: number;
}

export interface MlLinkGenerationResult {
  originalUrl: string;
  shortUrl: string | null;
  longUrl: string | null;
  ok: boolean;
  cached?: boolean;
  error?: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SESSION_ENC_FILE = path.join(DATA_DIR, 'ml-affiliate-session.enc.json');
const SHORTLINK_CACHE_FILE = path.join(DATA_DIR, 'ml-shortlinks-cache.json');
const DEFAULT_ML_TAG = 'mh20241004134402';
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const ALLOWED_ML_PRODUCT_HOSTS = new Set([
  'mercadolivre.com.br',
  'www.mercadolivre.com.br',
  'produto.mercadolivre.com.br',
  'mercadolibre.com.br',
  'www.mercadolibre.com.br',
  'meli.la',
]);

let inMemorySession: MlSessionRecord | null = null;
const shortlinkCache = new Map<string, string>();
let cacheLoaded = false;
let sessionLoaded = false;

function getConfiguredPersistenceKey(): Buffer | null {
  const rawSecret = (process.env.ML_SESSION_SECRET || process.env.SESSION_SECRET || '').trim();
  if (!rawSecret) return null;
  return crypto.scryptSync(rawSecret, 'megaachados027-ml-session-v1', 32);
}

function encryptSession(record: MlSessionRecord, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(record);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decryptSession(payloadStr: string, key: Buffer): MlSessionRecord | null {
  try {
    const parsed = JSON.parse(payloadStr) as {v?: number; iv?: string; tag?: string; data?: string};
    if (!parsed?.iv || !parsed?.tag || !parsed?.data) return null;
    const iv = Buffer.from(parsed.iv, 'base64');
    const authTag = Buffer.from(parsed.tag, 'base64');
    const data = Buffer.from(parsed.data, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    const record = JSON.parse(decrypted) as MlSessionRecord;
    if (!record || typeof record.cookie !== 'string' || !record.cookie.trim()) return null;
    return record;
  } catch {
    return null;
  }
}

function ensureShortlinkCacheLoaded() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    if (fs.existsSync(SHORTLINK_CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SHORTLINK_CACHE_FILE, 'utf8')) as Record<
        string,
        string
      >;
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof k === 'string' && typeof v === 'string' && /^https:\/\/meli\.la\//i.test(v)) {
            shortlinkCache.set(k, v);
          }
        }
      }
    }
  } catch {
    // Ignore corrupt cache file
  }
}

function persistShortlinkCache() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, {recursive: true});
    }
    const entries = Array.from(shortlinkCache.entries()).slice(-1500);
    const obj: Record<string, string> = {};
    for (const [k, v] of entries) {
      obj[k] = v;
    }
    fs.writeFileSync(SHORTLINK_CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch {
    // Ignore disk write failure
  }
}

function ensureSessionLoaded() {
  if (sessionLoaded) return;
  sessionLoaded = true;
  ensureShortlinkCacheLoaded();

  const key = getConfiguredPersistenceKey();
  if (key && fs.existsSync(SESSION_ENC_FILE)) {
    try {
      const raw = fs.readFileSync(SESSION_ENC_FILE, 'utf8');
      const restored = decryptSession(raw, key);
      if (restored) {
        inMemorySession = restored;
      }
    } catch {
      // Ignore decrypt error
    }
  }
}

function persistSessionIfKeyAvailable() {
  const key = getConfiguredPersistenceKey();
  if (!key) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, {recursive: true});
    }
    if (!inMemorySession) {
      if (fs.existsSync(SESSION_ENC_FILE)) {
        fs.unlinkSync(SESSION_ENC_FILE);
      }
      return;
    }
    const encrypted = encryptSession(inMemorySession, key);
    fs.writeFileSync(SESSION_ENC_FILE, encrypted, {encoding: 'utf8', mode: 0o600});
  } catch {
    // Keep session active in memory
  }
}

export function normalizeMlCacheKey(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    const mlbMatch =
      parsed.pathname.match(/\/p\/(MLB\d{6,})/i) ||
      parsed.pathname.match(/\/(MLB-?\d{6,})/i);
    if (mlbMatch) {
      return mlbMatch[1].toUpperCase().replace(/-/g, '');
    }
    return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return rawUrl.trim();
  }
}

export function getCachedMlShortUrl(rawUrl: string): string | null {
  ensureShortlinkCacheLoaded();
  if (!rawUrl) return null;
  const key = normalizeMlCacheKey(rawUrl);
  return shortlinkCache.get(key) || null;
}

export function normalizeAndValidateMlProductUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') return null;
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_ML_PRODUCT_HOSTS.has(host)) return null;
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeHeaderValue(val: string): string {
  return val.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Parses either:
 * 1) Full "Copy as cURL" command from browser DevTools (Unix or Windows CMD),
 * 2) Raw HTTP request headers containing Cookie / x-csrf-token,
 * 3) Plain Cookie string (ssid=...; _csrf=...; ...)
 */
export function parseMlSessionInput(
  rawInput: string,
  fallbackTag = DEFAULT_ML_TAG,
): {cookie: string; csrfToken: string; userAgent: string; tag: string} | null {
  const cleaned = rawInput
    .replace(/\^\r?\n/g, ' ')
    .replace(/\\\r?\n/g, ' ')
    .replace(/\^"/g, '"')
    .trim();

  if (!cleaned) return null;

  let cookie = '';
  let csrfToken = '';
  let userAgent = DEFAULT_UA;
  let tag = sanitizeHeaderValue(fallbackTag) || DEFAULT_ML_TAG;

  // 1. Extract -b / --cookie flag from cURL
  const curlCookieFlag =
    cleaned.match(/(?:^|\s)(?:-b|--cookie)\s+'([^']+)'/i) ||
    cleaned.match(/(?:^|\s)(?:-b|--cookie)\s+"([^"]+)"/i);
  if (curlCookieFlag?.[1]) {
    cookie = sanitizeHeaderValue(curlCookieFlag[1]);
  }

  // 2. Extract -H 'cookie: ...' or raw "Cookie: ..." header
  if (!cookie) {
    const headerCookie =
      cleaned.match(/-H\s+'cookie:\s*([^']+)'/i) ||
      cleaned.match(/-H\s+"cookie:\s*([^"]+)"/i) ||
      cleaned.match(/(?:^|\n)cookie:\s*([^\r\n]+)/i);
    if (headerCookie?.[1]) {
      cookie = sanitizeHeaderValue(headerCookie[1]);
    }
  }

  // 3. Extract x-csrf-token header
  const csrfMatch =
    cleaned.match(/-H\s+'x-csrf-token:\s*([^']+)'/i) ||
    cleaned.match(/-H\s+"x-csrf-token:\s*([^"]+)"/i) ||
    cleaned.match(/(?:^|\n)x-csrf-token:\s*([^\r\n]+)/i);
  if (csrfMatch?.[1]) {
    csrfToken = sanitizeHeaderValue(csrfMatch[1]);
  }

  // 4. Extract user-agent header
  const uaMatch =
    cleaned.match(/-H\s+'user-agent:\s*([^']+)'/i) ||
    cleaned.match(/-H\s+"user-agent:\s*([^"]+)"/i) ||
    cleaned.match(/(?:^|\n)user-agent:\s*([^\r\n]+)/i);
  if (uaMatch?.[1]) {
    userAgent = sanitizeHeaderValue(uaMatch[1]);
  }

  // 5. Extract tag from cURL JSON body if present
  const tagMatch = cleaned.match(/"tag"\s*:\s*"([a-zA-Z0-9._-]{3,64})"/);
  if (tagMatch?.[1]) {
    tag = tagMatch[1];
  }

  // 6. If input wasn't cURL/headers, treat raw input as a direct cookie string
  if (!cookie && !/^curl\s+/i.test(cleaned) && cleaned.includes('=')) {
    cookie = sanitizeHeaderValue(cleaned.replace(/^cookie:\s*/i, ''));
  }

  if (!cookie || !cookie.includes('=') || cookie.length < 16) {
    return null;
  }

  return {cookie, csrfToken, userAgent, tag};
}

export function getMlSessionStatus(): MlSessionPublicStatus {
  ensureSessionLoaded();
  ensureShortlinkCacheLoaded();
  const s = inMemorySession;
  return {
    connected: Boolean(s && s.cookie),
    verified: Boolean(s?.verified),
    tag: s?.tag || DEFAULT_ML_TAG,
    hasCsrfToken: Boolean(s?.csrfToken),
    persistedEncrypted: Boolean(getConfiguredPersistenceKey()),
    updatedAt: s?.updatedAt || null,
    lastVerifiedAt: s?.lastVerifiedAt || null,
    lastGeneratedShortUrl: s?.lastGeneratedShortUrl || null,
    lastError: s?.lastError || null,
    cachedLinksCount: shortlinkCache.size,
  };
}

export function isMlSessionConnected(): boolean {
  ensureSessionLoaded();
  return Boolean(inMemorySession?.cookie);
}

export function saveMlSession(parsed: {
  cookie: string;
  csrfToken: string;
  userAgent: string;
  tag: string;
}): MlSessionPublicStatus {
  ensureSessionLoaded();
  inMemorySession = {
    cookie: parsed.cookie,
    csrfToken: parsed.csrfToken,
    userAgent: parsed.userAgent || DEFAULT_UA,
    tag: parsed.tag || DEFAULT_ML_TAG,
    verified: false,
    updatedAt: new Date().toISOString(),
    lastVerifiedAt: null,
    lastGeneratedShortUrl: inMemorySession?.lastGeneratedShortUrl || null,
    lastError: null,
  };
  persistSessionIfKeyAvailable();
  return getMlSessionStatus();
}

export function clearMlSession(): MlSessionPublicStatus {
  ensureSessionLoaded();
  inMemorySession = null;
  persistSessionIfKeyAvailable();
  return getMlSessionStatus();
}

function findShortUrlInJson(obj: unknown, depth = 0): {shortUrl: string | null; longUrl: string | null} {
  if (depth > 6 || obj == null) return {shortUrl: null, longUrl: null};

  if (typeof obj === 'string') {
    if (/^https:\/\/meli\.la\/[A-Za-z0-9_-]+/i.test(obj.trim())) {
      return {shortUrl: obj.trim(), longUrl: null};
    }
    return {shortUrl: null, longUrl: null};
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findShortUrlInJson(item, depth + 1);
      if (found.shortUrl) return found;
    }
    return {shortUrl: null, longUrl: null};
  }

  if (typeof obj === 'object') {
    const rec = obj as Record<string, unknown>;
    const directShort =
      (typeof rec.short_url === 'string' && rec.short_url) ||
      (typeof rec.shortUrl === 'string' && rec.shortUrl) ||
      (typeof rec.short_link === 'string' && rec.short_link) ||
      (typeof rec.shortLink === 'string' && rec.shortLink) ||
      (typeof rec.link === 'string' && /^https:\/\/meli\.la\//i.test(rec.link) ? rec.link : '');
    const directLong =
      (typeof rec.long_url === 'string' && rec.long_url) ||
      (typeof rec.longUrl === 'string' && rec.longUrl) ||
      (typeof rec.origin_url === 'string' && rec.origin_url) ||
      null;

    if (directShort && /^https?:\/\//i.test(directShort)) {
      return {shortUrl: directShort.trim(), longUrl: directLong ? directLong.trim() : null};
    }

    for (const val of Object.values(rec)) {
      const found = findShortUrlInJson(val, depth + 1);
      if (found.shortUrl) {
        return {
          shortUrl: found.shortUrl,
          longUrl: found.longUrl || (directLong ? directLong.trim() : null),
        };
      }
    }
  }

  return {shortUrl: null, longUrl: null};
}

async function tryFetchCsrfTokenFromLinkBuilder(session: MlSessionRecord): Promise<string> {
  if (session.csrfToken) return session.csrfToken;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch('https://www.mercadolivre.com.br/afiliados/linkbuilder', {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        cookie: session.cookie,
        'user-agent': session.userAgent || DEFAULT_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
      },
    });
    if (!res.ok) return '';
    const html = await res.text();
    const metaMatch =
      html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']csrf-token["']/i) ||
      html.match(/"csrfToken"\s*:\s*"([^"]+)"/i) ||
      html.match(/"csrf"\s*:\s*"([^"]+)"/i);
    if (metaMatch?.[1]) {
      session.csrfToken = sanitizeHeaderValue(metaMatch[1]);
      persistSessionIfKeyAvailable();
      return session.csrfToken;
    }
    return '';
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateMlAffiliateLinkWithSession(
  rawProductUrl: string,
  options?: {bypassCache?: boolean},
): Promise<MlLinkGenerationResult> {
  ensureSessionLoaded();
  ensureShortlinkCacheLoaded();

  const validatedUrl = normalizeAndValidateMlProductUrl(rawProductUrl);
  if (!validatedUrl) {
    return {
      originalUrl: rawProductUrl,
      shortUrl: null,
      longUrl: null,
      ok: false,
      error: 'URL inválida. Informe uma URL de produto do Mercado Livre (mercadolivre.com.br).',
    };
  }

  // Already a meli.la link
  if (/^https:\/\/meli\.la\//i.test(validatedUrl)) {
    return {
      originalUrl: validatedUrl,
      shortUrl: validatedUrl,
      longUrl: null,
      ok: true,
      cached: true,
    };
  }

  const cacheKey = normalizeMlCacheKey(validatedUrl);
  if (!options?.bypassCache) {
    const cached = shortlinkCache.get(cacheKey);
    if (cached) {
      return {
        originalUrl: validatedUrl,
        shortUrl: cached,
        longUrl: null,
        ok: true,
        cached: true,
      };
    }
  }

  const session = inMemorySession;
  if (!session || !session.cookie) {
    return {
      originalUrl: validatedUrl,
      shortUrl: null,
      longUrl: null,
      ok: false,
      error: 'Conta do Mercado Livre ainda não conectada no painel admin.',
    };
  }

  const csrfToken = await tryFetchCsrfTokenFromLinkBuilder(session);

  const commonHeaders: Record<string, string> = {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
    'content-type': 'application/json',
    origin: 'https://www.mercadolivre.com.br',
    referer: 'https://www.mercadolivre.com.br/afiliados/linkbuilder',
    cookie: session.cookie,
    'user-agent': session.userAgent || DEFAULT_UA,
  };
  if (csrfToken) {
    commonHeaders['x-csrf-token'] = csrfToken;
  }

  const attempts: Array<{endpoint: string; body: Record<string, unknown>}> = [
    {
      endpoint: 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink',
      body: {urls: [validatedUrl], tag: session.tag},
    },
    {
      endpoint: 'https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links',
      body: {url: validatedUrl, tag: session.tag},
    },
  ];

  let lastErr = 'O Mercado Livre não retornou um link encurtado meli.la.';

  for (const attempt of attempts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(attempt.endpoint, {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers: commonHeaders,
        body: JSON.stringify(attempt.body),
      });

      if (response.status === 401 || response.status === 403) {
        lastErr =
          'Sessão do Mercado Livre expirada ou sem permissão (401/403). Gere um novo "Copiar como cURL" no Gerador de Links e reconecte.';
        continue;
      }

      if (response.status >= 300 && response.status < 400) {
        lastErr =
          'O Mercado Livre redirecionou para login/verificação. Copie o cURL atualizado da chamada createLink na sua conta logada.';
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        lastErr = `Resposta inesperada do Mercado Livre (HTTP ${response.status}). Verifique se o cURL ou Cookie está atualizado.`;
        continue;
      }

      const json = (await response.json()) as unknown;
      const found = findShortUrlInJson(json);
      if (found.shortUrl) {
        shortlinkCache.set(cacheKey, found.shortUrl);
        persistShortlinkCache();
        session.verified = true;
        session.lastVerifiedAt = new Date().toISOString();
        session.lastGeneratedShortUrl = found.shortUrl;
        session.lastError = null;
        persistSessionIfKeyAvailable();
        return {
          originalUrl: validatedUrl,
          shortUrl: found.shortUrl,
          longUrl: found.longUrl,
          ok: true,
        };
      }

      if (json && typeof json === 'object') {
        const errObj = json as Record<string, unknown>;
        const msg =
          (typeof errObj.message === 'string' && errObj.message) ||
          (typeof errObj.error === 'string' && errObj.error) ||
          '';
        if (msg) {
          lastErr = `Mercado Livre respondeu: ${msg}`;
        }
      }
    } catch {
      lastErr = 'Tempo esgotado ou erro de rede ao consultar o Gerador de Links do Mercado Livre.';
    } finally {
      clearTimeout(timeout);
    }
  }

  session.lastError = lastErr;
  persistSessionIfKeyAvailable();
  return {
    originalUrl: validatedUrl,
    shortUrl: null,
    longUrl: null,
    ok: false,
    error: lastErr,
  };
}
