import express, { type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import net from 'net';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPSTREAM_BASE = 'https://ais-pre-2nf54bq7hle7qcwczxouzs-561745921472.asia-east1.run.app';
const STUDYX_BASE = 'https://studyxpanda-tb.vercel.app';
const UPSTREAM_COOKIE = '__SECURE-aistudio_auth_token=one_token_to_rule_them_all';
const TB_DIRECT_API = 'https://seashell-app-3z5jp.ondigitalocean.app/api/v1';
const TPSTREAMS_BASE = 'https://app.tpstreams.com';
const TPSTREAMS_ORG = 'kuepke';

const CATALOG_CACHE_DIR = path.join(__dirname, 'catalog_cache');
const TREE_CACHE_DIR = path.join(CATALOG_CACHE_DIR, 'trees');
const VG_CACHE_DIR = path.join(CATALOG_CACHE_DIR, 'vg');
const BATCHES_CACHE_FILE = path.join(CATALOG_CACHE_DIR, 'batches.json');
const SHARED_SESSION_DIR = path.join(__dirname, 'data');
const SHARED_SESSION_FILE = path.join(SHARED_SESSION_DIR, 'shared-student-session.json');
const PERMANENT_LOCK_FILE = path.join(SHARED_SESSION_DIR, 'permanent-login-lock.json');

const zA = 'SPIDY_ULTRA_SHIELD_2026_E2EE_MASTER_KEY_V5_998877665544332211_TB_SECURE';
const cM = 'SPIDY_CLIENT_HANDSHAKE_V5_AUTH_2026';

const OFFICIAL_BRAND = 'GB STUDY';
const OFFICIAL_LOGO_SHA256 =
  'c35ec411f81c79d4ee978faef351aaff10bd5c3d74305664aad770d31df8342a';
const AUTHORIZED_HOST_TOKENS = ['bh67bu67g7ziwrcfvungkm', '26974065279'];

function deriveServerShieldSecret(): string {
  return `${OFFICIAL_BRAND.replace(/\s+/g, '_')}_${OFFICIAL_LOGO_SHA256.slice(0, 16)}_SHIELD_2026_LOCK`;
}

function signGbRequestServer(pathOnly: string, nonce: string): string {
  const combined = `${pathOnly}|${nonce}|${deriveServerShieldSecret()}`;
  let h1 = 2166136261;
  let h2 = 461845907;
  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 16777619);
    h2 ^= ch + (i & 255);
    h2 = Math.imul(h2, 2246822507);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`.toLowerCase();
}

function verifyDiskLogoIntegrity(): boolean {
  try {
    const logoPath = path.join(__dirname, 'public', 'logo.png');
    if (!fs.existsSync(logoPath)) return false;
    const hash = crypto.createHash('sha256').update(fs.readFileSync(logoPath)).digest('hex');
    return hash === OFFICIAL_LOGO_SHA256;
  } catch {
    return false;
  }
}

const SERVER_LOGO_INTACT = verifyDiskLogoIntegrity();

function isAllowedClientHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (!h) return false;
  if (h === 'localhost' || h === '127.0.0.1') return true;
  if (
    h === 'gbstudytb.pages.dev' ||
    h.endsWith('.gbstudytb.pages.dev') ||
    h === 'gbstudykhangs.pages.dev' ||
    h.endsWith('.gbstudykhangs.pages.dev')
  ) {
    return true;
  }
  if (h.endsWith('.google.com') || h.endsWith('.scf.usercontent.goog')) return true;
  if (h.endsWith('.ai.studio') && h.startsWith('gb-study')) return true;
  if (h.endsWith('.run.app') && AUTHORIZED_HOST_TOKENS.some((t) => h.includes(t))) return true;
  return false;
}

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(bucketKey: string, maxReq: number, windowMs: number): boolean {
  const now = Date.now();
  if (rateLimitBuckets.size > 5000) {
    for (const [k, v] of rateLimitBuckets.entries()) {
      if (now >= v.resetAt) rateLimitBuckets.delete(k);
    }
  }
  const cur = rateLimitBuckets.get(bucketKey);
  if (!cur || now >= cur.resetAt) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= maxReq) return false;
  cur.count += 1;
  return true;
}

const SECURITY_HMAC_SECRET = crypto
  .createHash('sha256')
  .update(`${zA}:${OFFICIAL_LOGO_SHA256}:pow_clearance_2026`)
  .digest();

function hmacHex(input: string): string {
  return crypto.createHmac('sha256', SECURITY_HMAC_SECRET).update(input).digest('hex');
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

function issueClearanceToken(): string {
  const ts = Date.now();
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `${ts}.${nonce}`;
  const sig = hmacHex(`CLR:${payload}`).slice(0, 32);
  return `${payload}.${sig}`;
}

function verifyClearanceToken(token: string | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return false;
  const [tsStr, nonce, sig] = parts;
  const ts = Number(tsStr);
  if (!ts || !nonce || !sig) return false;
  if (Date.now() - ts > 24 * 3600 * 1000) return false;
  const expected = hmacHex(`CLR:${tsStr}.${nonce}`).slice(0, 32);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function vm(t: string | number, e: string | number, n = '') {
  const s = `${zA}:${n}:${t}:${e}`;
  const a = new TextEncoder().encode(s);
  const l = new Uint8Array(256);
  for (let d = 0; d < 256; d++) l[d] = d;
  let c = 0;
  for (let d = 0; d < 3; d++) {
    for (let m = 0; m < 256; m++) {
      c = (c + l[m] + a[m % a.length] + m * 29 + d * 13) & 255;
      const g = l[m];
      l[m] = l[c];
      l[c] = g;
    }
  }
  return l;
}

function bv(t: string) {
  const e = `${t}:${cM}:${zA}`;
  let n = 2166136261;
  let s = 3421674724;
  for (let a = 0; a < e.length; a++) {
    const l = e.charCodeAt(a);
    n ^= l;
    n = Math.imul(n, 16777619);
    s ^= l + (a & 255);
    s = Math.imul(s, 16777619);
  }
  return `${(n >>> 0).toString(16).padStart(8, '0')}${(s >>> 0).toString(16).padStart(8, '0')}`;
}

function encryptPayload(t: any) {
  const e = crypto.randomBytes(16).toString('hex');
  const n = Date.now();
  const s = JSON.stringify(t === undefined ? null : t);
  const a = new TextEncoder().encode(s);
  const l = vm(e, n);
  const c = new Uint8Array(a.length);
  let d = 0;
  let m = 0;
  let g = 90;
  for (let i = 0; i < a.length; i++) {
    d = (d + 1) & 255;
    m = (m + l[d]) & 255;
    const b = l[d];
    l[d] = l[m];
    l[m] = b;
    const T = l[(l[d] + l[m]) & 255];
    const k = (a[i] ^ T ^ g) & 255;
    c[i] = k;
    g = (k + T) & 255;
  }
  const E = Buffer.from(c).toString('base64');
  return {
    _enc: 1,
    _v: 'spidy_e2ee_v5',
    _s: E,
    _n: e,
    _t: n,
    _h: bv(`${e}:${n}:${E.length}`),
  };
}

function decryptPayload(t: any): any {
  if (!t || typeof t !== 'object' || t._enc !== 1) return t;
  const { _s: e, _n: n, _t: s } = t;
  const c = new Uint8Array(Buffer.from(e, 'base64'));
  const d = vm(n, s);
  const m = new Uint8Array(c.length);
  let g = 0;
  let E = 0;
  let prev = 90;
  for (let T = 0; T < c.length; T++) {
    g = (g + 1) & 255;
    E = (E + d[g]) & 255;
    const k = d[g];
    d[g] = d[E];
    d[E] = k;
    const G = d[(d[g] + d[E]) & 255];
    const ch = c[T];
    m[T] = (ch ^ G ^ prev) & 255;
    prev = (ch + G) & 255;
  }
  return JSON.parse(new TextDecoder().decode(m));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    if (net.isIPv4(host)) {
      const parts = host.split('.').map(Number);
      if (
        parts[0] === 10 ||
        parts[0] === 127 ||
        parts[0] === 0 ||
        (parts[0] === 169 && parts[1] === 254) ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168)
      ) {
        return false;
      }
    }
    if (net.isIPv6(host)) {
      if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function rebrandText(text: string): string {
  return text
    .replace(/target\s*board/gi, 'GB STUDY')
    .replace(/study\s*x\s*panda/gi, 'GB STUDY')
    .replace(/studyxpanda/gi, 'gbstudy')
    .replace(/spidy\s*study/gi, 'GB STUDY')
    .replace(/@spidystudy/gi, '@gbstudy');
}

function rebrandSafeStrings(obj: any): any {
  if (typeof obj === 'string') {
    if (obj.startsWith('eyJ') || obj.startsWith('/api/') || obj.startsWith('http')) {
      return obj;
    }
    return rebrandText(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(rebrandSafeStrings);
  }
  if (obj && typeof obj === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (
        k === 'token' ||
        k === 'tempToken' ||
        k === 'adminToken' ||
        k === 'watchUrl' ||
        k === 'url' ||
        k === 'hlsUrl' ||
        k === 'videoUrl' ||
        k === 'streamUrl' ||
        k === 'pdf_link' ||
        k === 'assetId' ||
        k === 'tpAssetId'
      ) {
        out[k] = v;
      } else {
        out[k] = rebrandSafeStrings(v);
      }
    }
    return out;
  }
  return obj;
}

interface SharedStudentSession {
  token: string;
  user: Record<string, any>;
  mobile: string;
  sessionId?: string;
  updatedAt: number;
}

function isValidTargetBoardJwt(token: unknown, mobile?: unknown, sessionId?: unknown): boolean {
  if (typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (trimmed.length < 30 || trimmed.startsWith('tb_user_token_')) return false;
  if (trimmed.split('.').length !== 3) return false;
  const mob = String(mobile || '').replace(/[^0-9]/g, '').slice(-10);
  if (mob === '9999999999') return false;
  const sid = String(sessionId || '');
  if (sid.startsWith('sess_test')) return false;
  return true;
}

function getMaskedMobileHint(mobile: string | undefined | null): string {
  const clean = String(mobile || '').replace(/[^0-9]/g, '').slice(-10);
  if (clean.length < 4) return '';
  return `******${clean.slice(-4)}`;
}

function loadPermanentLockFromDisk(): string {
  try {
    if (fs.existsSync(PERMANENT_LOCK_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(PERMANENT_LOCK_FILE, 'utf8'));
      const mob = String(parsed?.mobile || '').replace(/[^0-9]/g, '').slice(-10);
      if (mob.length === 10 && mob !== '9999999999') return mob;
    }
  } catch {
    // ignore corrupted lock file
  }
  return '';
}

function loadSharedSessionFromDisk(): SharedStudentSession | null {
  try {
    if (!fs.existsSync(SHARED_SESSION_FILE)) return null;
    const raw = fs.readFileSync(SHARED_SESSION_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && isValidTargetBoardJwt(parsed.token, parsed.mobile, parsed.sessionId)) {
      return parsed as SharedStudentSession;
    }
  } catch {
    // ignore corrupted session file
  }
  return null;
}

let sharedStudentSession: SharedStudentSession | null = loadSharedSessionFromDisk();
let permanentLockedMobile: string = loadPermanentLockFromDisk();

function ensurePermanentMobileLocked(mobile: unknown) {
  const clean = String(mobile || '').replace(/[^0-9]/g, '').slice(-10);
  if (clean.length !== 10 || clean === '9999999999') return;
  if (permanentLockedMobile && permanentLockedMobile.length === 10) {
    // Already permanently locked to the first logged-in number; never overwrite!
    return;
  }
  permanentLockedMobile = clean;
  try {
    if (!fs.existsSync(SHARED_SESSION_DIR)) {
      fs.mkdirSync(SHARED_SESSION_DIR, { recursive: true });
    }
    fs.writeFileSync(
      PERMANENT_LOCK_FILE,
      JSON.stringify({ mobile: clean, lockedAt: Date.now() }, null, 2),
      'utf8'
    );
  } catch (err: any) {
    console.error('Failed to persist permanent mobile lock:', err?.message || err);
  }
}

if (!permanentLockedMobile && sharedStudentSession?.mobile) {
  ensurePermanentMobileLocked(sharedStudentSession.mobile);
}

function checkPermanentMobileLock(candidateMobile: string): {
  allowed: boolean;
  lockedHint: string;
  message?: string;
} {
  if (!permanentLockedMobile || permanentLockedMobile.length !== 10) {
    return { allowed: true, lockedHint: '' };
  }
  const lockedHint = getMaskedMobileHint(permanentLockedMobile);
  if (candidateMobile && candidateMobile !== permanentLockedMobile) {
    return {
      allowed: false,
      lockedHint,
      message: `यह वेबसाइट स्थायी रूप से पहली बार लॉगिन किए गए नंबर (${lockedHint}) से लॉक है। किसी दूसरे नंबर से लॉगिन नहीं किया जा सकता।`,
    };
  }
  return { allowed: true, lockedHint };
}

function makeTbDirectHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8,hi;q=0.7',
    Origin: 'https://targetboard.co.in',
    Referer: 'https://targetboard.co.in/',
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    ...extra,
  };
}

interface LocalStreamTicket {
  kind: 'tpstreams' | 'hls' | 'html' | 'youtube' | 'embed';
  assetId?: string;
  accessToken?: string;
  hlsUrl?: string;
  youtubeUrl?: string;
  embedUrl?: string;
  html?: string;
  isLive: boolean;
  createdAt: number;
}

const localStreamTickets = new Map<string, LocalStreamTicket>();
const recentTicketMeta = new Map<string, { assetId: string; isLive: boolean; hlsUrl: string; playerKey: string }>();

function createLocalTicket(meta: Omit<LocalStreamTicket, 'createdAt'>): string {
  const now = Date.now();
  if (localStreamTickets.size > 300) {
    for (const [key, val] of localStreamTickets.entries()) {
      if (now - val.createdAt > 4 * 3600 * 1000) {
        localStreamTickets.delete(key);
      }
    }
    if (localStreamTickets.size > 300) {
      localStreamTickets.clear();
    }
  }
  const ticketId = `stk_local_${crypto.randomBytes(18).toString('hex')}`;
  localStreamTickets.set(ticketId, { ...meta, createdAt: now });
  return ticketId;
}

const treeFreshAt = new Map<string, number>();

function persistSharedSession(input: {
  token?: unknown;
  user?: any;
  mobile?: unknown;
  sessionId?: unknown;
}) {
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  if (!isValidTargetBoardJwt(token, input.mobile ?? input.user?.mobile, input.sessionId)) {
    return false;
  }

  const cleanMobile = String(
    input.mobile || input.user?.mobile || permanentLockedMobile || sharedStudentSession?.mobile || ''
  )
    .replace(/[^0-9]/g, '')
    .slice(-10);

  if (permanentLockedMobile && cleanMobile && cleanMobile !== permanentLockedMobile) {
    return false;
  }

  ensurePermanentMobileLocked(cleanMobile);

  const normalizedUser = {
    id: String(input.user?._id || input.user?.id || 'gb_student'),
    name: 'GB STUDY Student',
    fullName: 'GB STUDY Student',
    mobile: permanentLockedMobile || cleanMobile,
    role: 'student',
    isAdmin: false,
  };

  const tokenChanged = sharedStudentSession?.token !== token;

  sharedStudentSession = {
    token,
    user: normalizedUser,
    mobile: permanentLockedMobile || cleanMobile,
    sessionId: typeof input.sessionId === 'string' ? input.sessionId : '',
    updatedAt: Date.now(),
  };

  try {
    if (!fs.existsSync(SHARED_SESSION_DIR)) {
      fs.mkdirSync(SHARED_SESSION_DIR, { recursive: true });
    }
    fs.writeFileSync(SHARED_SESSION_FILE, JSON.stringify(sharedStudentSession, null, 2), 'utf8');
  } catch (err: any) {
    console.error('Failed to write shared session:', err?.message || err);
  }

  if (tokenChanged) {
    treeFreshAt.clear();
    void refreshCatalogFromTargetBoard(token);
  }
  return true;
}

let isRefreshingCatalog = false;

async function refreshCatalogFromTargetBoard(token: string) {
  if (!token || token.length <= 20 || isRefreshingCatalog) return;
  isRefreshingCatalog = true;
  try {
    fs.mkdirSync(TREE_CACHE_DIR, { recursive: true });
    const headers = makeTbDirectHeaders({ Authorization: `Bearer ${token}` });

    const courseIds = new Set<string>();
    let cachedBatches: any = { new: [] };
    if (fs.existsSync(BATCHES_CACHE_FILE)) {
      try {
        cachedBatches = JSON.parse(fs.readFileSync(BATCHES_CACHE_FILE, 'utf8'));
        for (const b of cachedBatches?.new || []) {
          if (b?.id || b?._id) courseIds.add(String(b.id || b._id));
        }
      } catch {
        // ignore
      }
    }

    try {
      const cRes = await fetchWithTimeout(`${TB_DIRECT_API}/student-courses`, { headers }, 8000);
      if (cRes.ok) {
        const rawCourses: any = await cRes.json().catch(() => null);
        const list = Array.isArray(rawCourses)
          ? rawCourses
          : Array.isArray(rawCourses?.data)
            ? rawCourses.data
            : Array.isArray(rawCourses?.courses)
              ? rawCourses.courses
              : Array.isArray(rawCourses?.batches)
                ? rawCourses.batches
                : [];
        if (list.length > 0) {
          const localThumbs = getLocalThumbFileMap();
          const byId = new Map<string, any>();
          for (const existing of cachedBatches?.new || []) {
            const id = String(existing.id || existing._id || '');
            if (id) byId.set(id, existing);
          }
          for (const c of list) {
            const id = String(c._id || c.id || '');
            if (!id) continue;
            courseIds.add(id);
            const prev = byId.get(id) || {};
            const cleanTitle = rebrandText(String(c.title || c.name || prev.title || 'Course Batch'));
            const classLabel = rebrandText(
              String(c.classLabel || c.classId?.name || c.class?.name || prev.classLabel || '')
            );
            const rawThumb = c.thumbnail || c.courseImage || c.coverImage || c.bannerUrl || c.banner || c.image;
            const normalizedThumb = prev.thumbnail && prev.thumbnail !== '/default-thumbnail.png'
              ? prev.thumbnail
              : normalizeStudyxThumbnail(rawThumb, id, cleanTitle, classLabel, localThumbs);
            byId.set(id, {
              ...prev,
              id,
              _id: id,
              title: cleanTitle,
              thumbnail: normalizedThumb,
              category: c.category?.name || c.category || prev.category || '',
              classLabel,
            });
          }
          fs.writeFileSync(
            BATCHES_CACHE_FILE,
            JSON.stringify({ ...cachedBatches, source: 'tb_direct', new: Array.from(byId.values()) }),
            'utf8'
          );
        }
      }
    } catch {
      // keep existing batches.json
    }

    const ids = Array.from(courseIds);
    const concurrency = 4;
    for (let i = 0; i < ids.length; i += concurrency) {
      await Promise.all(
        ids.slice(i, i + concurrency).map(async (id) => {
          try {
            const tRes = await fetchWithTimeout(
              `${TB_DIRECT_API}/category/tree-user/${encodeURIComponent(id)}/v2`,
              { headers },
              10000
            );
            if (!tRes.ok) return;
            const json: any = await tRes.json().catch(() => null);
            const arr = Array.isArray(json)
              ? json
              : Array.isArray(json?.data)
                ? json.data
                : null;
            if (arr && arr.length > 0) {
              const cleaned = rebrandSafeStrings(arr);
              fs.writeFileSync(path.join(TREE_CACHE_DIR, `${id}.json`), JSON.stringify(cleaned), 'utf8');
              treeFreshAt.set(`${id}:auth`, Date.now());
            }
          } catch {
            // keep cached tree if fetch fails
          }
        })
      );
    }
  } finally {
    isRefreshingCatalog = false;
  }
}

function makeUpstreamHeaders(req?: Request): Record<string, string> {
  const ts = Date.now();
  const nonce = crypto.randomBytes(12).toString('hex');
  const shield = Buffer.from(`${ts}:spidy_sec_auth_${ts % 864e5}`).toString('base64');

  const headers: Record<string, string> = {
    Cookie: UPSTREAM_COOKIE,
    'X-TB-Shield-Key': shield,
    'X-Spidy-Ts': String(ts),
    'X-Spidy-Nonce': nonce,
    'X-Spidy-Sig': bv(`${ts}:${nonce}`),
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Referer: `${UPSTREAM_BASE}/`,
    Origin: UPSTREAM_BASE,
  };

  if (req) {
    const forwardKeys = [
      'authorization',
      'content-type',
      'accept',
      'range',
      'if-none-match',
      'if-modified-since',
      'x-spidy-e2ee-req',
      'x-client-referrer',
      'x-csrftoken',
      'x-requested-with',
    ];
    for (const key of forwardKeys) {
      const val = req.headers[key];
      if (typeof val === 'string' && val.length > 0) {
        headers[key] = val;
      }
    }
    if (
      req.originalUrl.startsWith('/api/v1/category/tree-user/') &&
      !headers['authorization'] &&
      sharedStudentSession?.token
    ) {
      headers['authorization'] = `Bearer ${sharedStudentSession.token}`;
    }
  }

  return headers;
}

const SAFE_RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'accept-ranges',
  'content-range',
  'cache-control',
  'etag',
  'last-modified',
];

function stripLegacyPlayerOverlay(html: string): string {
  return html
    .replace(/<style[^>]*id=["']gb-study-player-style["'][^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<div[^>]*class=["'][^"']*gb-wm[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
}

function buildGbStudyAddonHtml(): string {
  return `
<style id="nt-player-style">
  html, body {
    background: #000 !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
    font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif !important;
    -webkit-tap-highlight-color: transparent;
  }
  video, .video-js, .video-js video, .vjs-tech {
    width: 100% !important;
    height: 100% !important;
    max-height: 100dvh !important;
    background: #000 !important;
    object-fit: contain !important;
    object-position: center !important;
  }
  /* Hide third-party Video.js / native player chrome once NextToppers HUD mounts */
  body.nt-hud-active .vjs-control-bar,
  body.nt-hud-active .vjs-big-play-button,
  body.nt-hud-active .vjs-loading-spinner,
  body.nt-hud-active .vjs-poster,
  body.nt-hud-active .vjs-title-bar,
  body.nt-hud-active .vjs-error-display,
  body.nt-hud-active .vjs-modal-dialog,
  body.nt-hud-active .shaka-controls-container,
  body.nt-hud-active .shaka-spinner-container {
    display: none !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
  #nt-player-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    pointer-events: none;
    color: #fff;
    user-select: none;
    -webkit-user-select: none;
    font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif;
  }
  #nt-gesture-layer {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    z-index: 1;
    touch-action: manipulation;
  }
  #nt-scrim-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 112px;
    background: linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0));
    pointer-events: none;
    z-index: 2;
    transition: opacity 200ms ease;
  }
  #nt-scrim-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 168px;
    background: linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0));
    pointer-events: none;
    z-index: 2;
    transition: opacity 200ms ease;
  }
  .nt-hud-hidden #nt-scrim-top,
  .nt-hud-hidden #nt-scrim-bottom {
    opacity: 0;
  }
  #nt-spinner {
    position: absolute;
    inset: 0;
    display: none;
    place-items: center;
    pointer-events: none;
    z-index: 3;
  }
  #nt-spinner.nt-show {
    display: grid;
  }
  .nt-ring {
    width: 34px;
    height: 34px;
    border-radius: 9999px;
    border: 5px solid #3f3f3f;
    border-top-color: #dedede;
    border-right-color: #777777;
    animation: ntSpin 0.8s linear infinite;
  }
  @keyframes ntSpin {
    to { transform: rotate(360deg); }
  }
  @keyframes ntMenuIn {
    0% { opacity: 0; transform: scale(0.95) translateY(6px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  #nt-seek-toast {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 4;
    padding: 8px 16px;
    border-radius: 9999px;
    background: rgba(23, 23, 28, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.14);
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    pointer-events: none;
    opacity: 0;
    transition: opacity 150ms ease;
  }
  #nt-seek-toast.nt-show {
    opacity: 1;
  }
  #nt-top-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    padding-top: max(16px, env(safe-area-inset-top));
    pointer-events: none;
    transition: opacity 200ms ease, transform 200ms ease;
  }
  @media (min-width: 1024px) {
    #nt-top-bar { padding: 24px; padding-top: max(24px, env(safe-area-inset-top)); }
  }
  .nt-hud-hidden #nt-top-bar {
    opacity: 0;
    transform: translateY(-12px);
  }
  #nt-top-bar .nt-bar-group {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    pointer-events: auto;
  }
  .nt-hud-hidden #nt-top-bar .nt-bar-group,
  .nt-hud-hidden #nt-bottom-bar {
    pointer-events: none !important;
  }
  .nt-icon-btn {
    display: inline-grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 9999px;
    background: transparent;
    color: #fff;
    cursor: pointer;
    transition: transform 180ms ease, background-color 150ms ease;
    padding: 0;
  }
  .nt-icon-btn:hover { transform: scale(1.1); background: rgba(255,255,255,0.08); }
  .nt-icon-btn:active { transform: scale(0.9); }
  #nt-title-pill {
    display: none;
    max-width: min(420px, 55vw);
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.92);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media (min-width: 640px) {
    #nt-title-pill.nt-has-title { display: block; }
  }
  .nt-wm-subtle {
    position: absolute;
    top: 18px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.14em;
    color: rgba(255,255,255,0.22);
    pointer-events: none;
    z-index: 2;
  }
  #nt-bottom-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 5;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    pointer-events: auto;
    transition: opacity 200ms ease, transform 200ms ease;
  }
  .nt-hud-hidden #nt-bottom-bar {
    opacity: 0;
    transform: translateY(12px);
  }
  #nt-time-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 24px 10px 24px;
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  @media (min-width: 768px) {
    #nt-time-row { font-size: 16px; padding-bottom: 14px; }
  }
  #nt-progress-wrap {
    padding: 4px 16px 6px 16px;
  }
  @media (min-width: 1024px) {
    #nt-progress-wrap { padding: 4px 24px 8px 24px; }
  }
  #nt-progress {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 9999px;
    outline: none;
    cursor: pointer;
    background: linear-gradient(
      to right,
      #ffffff 0%,
      #ffffff var(--nt-played, 0%),
      #777777 var(--nt-played, 0%),
      #777777 var(--nt-buf, 0%),
      #4c4c4c var(--nt-buf, 0%),
      #4c4c4c 100%
    );
    transition: height 120ms ease;
  }
  #nt-progress:hover { height: 6px; }
  #nt-progress::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 13px;
    height: 13px;
    border-radius: 9999px;
    background: #ffffff;
    border: 0;
    box-shadow: 0 1px 4px rgba(0,0,0,0.45);
    cursor: pointer;
  }
  #nt-progress::-moz-range-thumb {
    width: 13px;
    height: 13px;
    border-radius: 9999px;
    background: #ffffff;
    border: 0;
    box-shadow: 0 1px 4px rgba(0,0,0,0.45);
    cursor: pointer;
  }
  #nt-controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px 8px 16px;
  }
  @media (min-width: 1024px) {
    #nt-controls-row { padding: 10px 24px 10px 24px; }
  }
  .nt-ctrl-left, .nt-ctrl-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  @media (min-width: 640px) {
    .nt-ctrl-left, .nt-ctrl-right { gap: 18px; }
  }
  #nt-vol-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  #nt-vol-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 0;
    opacity: 0;
    height: 4px;
    border-radius: 9999px;
    background: rgba(255,255,255,0.35);
    outline: none;
    cursor: pointer;
    transition: width 260ms ease, opacity 220ms ease;
  }
  @media (hover: hover) {
    #nt-vol-group:hover #nt-vol-slider,
    #nt-vol-slider:focus {
      width: 78px;
      opacity: 1;
    }
  }
  #nt-vol-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 9999px;
    background: #ffffff;
    border: 0;
  }
  .nt-menu-anchor { position: relative; }
  .nt-popup-menu {
    position: absolute;
    right: 0;
    z-index: 20;
    width: min(270px, calc(100vw - 24px));
    border-radius: 8px;
    background: rgba(35, 35, 42, 0.96);
    padding: 6px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    animation: ntMenuIn 180ms cubic-bezier(0.16, 1, 0.3, 1);
    display: none;
  }
  .nt-popup-menu.nt-open { display: block; }
  .nt-popup-top { top: 48px; }
  .nt-popup-bottom { bottom: 48px; max-height: min(65vh, 360px); overflow-y: auto; }
  .nt-menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 44px;
    padding: 8px 12px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background-color 140ms ease;
  }
  .nt-menu-item:hover { background: rgba(255,255,255,0.1); }
  .nt-menu-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .nt-menu-right {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #b5bbc5;
  }
  .nt-radio-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 40px;
    padding: 7px 12px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }
  .nt-radio-item:hover { background: rgba(255,255,255,0.1); }
  .nt-radio-dot {
    width: 16px;
    height: 16px;
    border-radius: 9999px;
    border: 1.5px solid #9ca3af;
    display: inline-grid;
    place-items: center;
    flex-shrink: 0;
  }
  .nt-radio-item.nt-active .nt-radio-dot {
    border-color: #ffffff;
    background: #ffffff;
  }
  .nt-radio-item.nt-active .nt-radio-dot::after {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 9999px;
    background: #17171c;
  }
  .nt-divider {
    height: 1px;
    background: rgba(255,255,255,0.1);
    margin: 4px 0;
  }
</style>
<script>
  (function() {
    window.addEventListener('contextmenu', function(e) { e.preventDefault(); }, true);
    window.addEventListener('selectstart', function(e) { e.preventDefault(); }, true);
    window.addEventListener('dragstart', function(e) { e.preventDefault(); }, true);
    window.addEventListener('copy', function(e) { e.preventDefault(); }, true);
    window.addEventListener('keydown', function(e) {
      var k = (e.key || '').toLowerCase();
      if (
        k === 'f12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c', 'k'].indexOf(k) !== -1) ||
        (e.metaKey && e.altKey && ['i', 'j', 'c', 'u'].indexOf(k) !== -1) ||
        ((e.ctrlKey || e.metaKey) && ['u', 's', 'p', 'c'].indexOf(k) !== -1)
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    var ctx = {
      hasNotes: false,
      hasPlaylist: false,
      title: '',
      isLive: Boolean(window.__gbIsLive),
      isFullscreen: false
    };

    window.addEventListener('message', function(e) {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'GB_PLAYER_CONTEXT') {
        ctx.hasNotes = !!e.data.hasNotes;
        ctx.hasPlaylist = !!e.data.hasPlaylist;
        ctx.title = e.data.title || '';
        ctx.isLive = !!e.data.isLive;
        ctx.isFullscreen = !!e.data.isFullscreen;
        if (window.__ntSyncContext) window.__ntSyncContext();
      } else if (e.data.type === 'GB_PLAYER_FS_STATE') {
        ctx.isFullscreen = !!e.data.isFullscreen;
        if (window.__ntSyncFsIcon) window.__ntSyncFsIcon();
      }
    });

    function postParent(type, extra) {
      try {
        window.parent.postMessage(Object.assign({ type: type }, extra || {}), '*');
      } catch (e) {}
    }

    function fmtTime(sec) {
      if (!isFinite(sec) || sec < 0) return '0:00';
      var s = Math.floor(sec);
      var h = Math.floor(s / 3600);
      var m = Math.floor((s % 3600) / 60);
      var r = s % 60;
      var pad = r < 10 ? '0' + r : String(r);
      if (h > 0) return h + ':' + (m < 10 ? '0' + m : m) + ':' + pad;
      return m + ':' + pad;
    }

    function mountNtHud(video) {
      if (document.getElementById('nt-player-overlay')) return;
      document.body.classList.add('nt-hud-active');
      video.removeAttribute('controls');

      var overlay = document.createElement('div');
      overlay.id = 'nt-player-overlay';
      overlay.innerHTML = [
        '<div id="nt-gesture-layer"></div>',
        '<div class="nt-wm-subtle">GB STUDY</div>',
        '<div id="nt-scrim-top"></div>',
        '<div id="nt-scrim-bottom"></div>',
        '<div id="nt-spinner"><div class="nt-ring" aria-label="Loading"></div></div>',
        '<div id="nt-seek-toast"></div>',
        '<div id="nt-top-bar">',
          '<div class="nt-bar-group">',
            '<button id="nt-back-btn" class="nt-icon-btn" type="button" aria-label="Go back" title="Back">',
              '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
            '</button>',
            '<span id="nt-title-pill"></span>',
          '</div>',
          '<div class="nt-bar-group nt-menu-anchor">',
            '<button id="nt-more-btn" class="nt-icon-btn" type="button" aria-label="More options">',
              '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
            '</button>',
            '<div id="nt-more-menu" class="nt-popup-menu nt-popup-top">',
              '<button id="nt-opt-reload" class="nt-menu-item" type="button">',
                '<span class="nt-menu-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg><span>Reload video</span></span>',
              '</button>',
              '<button id="nt-opt-notes" class="nt-menu-item" type="button" style="display:none;">',
                '<span class="nt-menu-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#29ff94" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg><span>Open Notes</span></span>',
              '</button>',
              '<button id="nt-opt-playlist" class="nt-menu-item" type="button" style="display:none;">',
                '<span class="nt-menu-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9387FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/><path d="m16 12 5 3-5 3v-6Z"/></svg><span>Classes Playlist</span></span>',
              '</button>',
            '</div>',
          '</div>',
        '</div>',
        '<div id="nt-bottom-bar">',
          '<div id="nt-time-row"><span id="nt-cur">0:00</span><span style="color:#b5bbc5">/</span><span id="nt-dur" style="color:#b5bbc5">0:00</span></div>',
          '<div id="nt-progress-wrap"><input id="nt-progress" type="range" min="0" max="1000" value="0" aria-label="Seek" /></div>',
          '<div id="nt-controls-row">',
            '<div class="nt-ctrl-left">',
              '<button id="nt-play-btn" class="nt-icon-btn" type="button" aria-label="Play or Pause"></button>',
              '<button id="nt-rw-btn" class="nt-icon-btn" type="button" aria-label="Back 10 seconds">',
                '<span style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;">',
                  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
                  '<span style="position:absolute;font-size:8.5px;font-weight:800;line-height:1;margin-top:2px;">10</span>',
                '</span>',
              '</button>',
              '<button id="nt-fw-btn" class="nt-icon-btn" type="button" aria-label="Forward 10 seconds">',
                '<span style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;">',
                  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
                  '<span style="position:absolute;font-size:8.5px;font-weight:800;line-height:1;margin-top:2px;">10</span>',
                '</span>',
              '</button>',
              '<div id="nt-vol-group">',
                '<button id="nt-mute-btn" class="nt-icon-btn" type="button" aria-label="Mute or Unmute"></button>',
                '<input id="nt-vol-slider" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume" />',
              '</div>',
            '</div>',
            '<div class="nt-ctrl-right nt-menu-anchor">',
              '<button id="nt-settings-btn" class="nt-icon-btn" type="button" aria-label="Settings">',
                '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
              '</button>',
              '<div id="nt-settings-menu" class="nt-popup-menu nt-popup-bottom"></div>',
              '<button id="nt-fs-btn" class="nt-icon-btn" type="button" aria-label="Fullscreen"></button>',
            '</div>',
          '</div>',
        '</div>'
      ].join('');
      document.body.appendChild(overlay);

      var gestureLayer = document.getElementById('nt-gesture-layer');
      var spinner = document.getElementById('nt-spinner');
      var seekToast = document.getElementById('nt-seek-toast');
      var titlePill = document.getElementById('nt-title-pill');
      var moreBtn = document.getElementById('nt-more-btn');
      var moreMenu = document.getElementById('nt-more-menu');
      var optReload = document.getElementById('nt-opt-reload');
      var optNotes = document.getElementById('nt-opt-notes');
      var optPlaylist = document.getElementById('nt-opt-playlist');
      var curEl = document.getElementById('nt-cur');
      var durEl = document.getElementById('nt-dur');
      var progress = document.getElementById('nt-progress');
      var playBtn = document.getElementById('nt-play-btn');
      var rwBtn = document.getElementById('nt-rw-btn');
      var fwBtn = document.getElementById('nt-fw-btn');
      var muteBtn = document.getElementById('nt-mute-btn');
      var volSlider = document.getElementById('nt-vol-slider');
      var settingsBtn = document.getElementById('nt-settings-btn');
      var settingsMenu = document.getElementById('nt-settings-menu');
      var fsBtn = document.getElementById('nt-fs-btn');
      var backBtn = document.getElementById('nt-back-btn');

      var hideTimer = null;
      var seekToastTimer = null;
      var activeSettingsPage = 'main';
      var selectedSpeed = video.playbackRate || 1;
      var selectedQuality = 'Auto';

      var SVG_PLAY = '<svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
      var SVG_PAUSE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
      var SVG_VOL = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
      var SVG_MUTE = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>';
      var SVG_FS_IN = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
      var SVG_FS_OUT = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

      function showHud() {
        overlay.classList.remove('nt-hud-hidden');
        clearTimeout(hideTimer);
        var menuOpen = moreMenu.classList.contains('nt-open') || settingsMenu.classList.contains('nt-open');
        if (!video.paused && !menuOpen) {
          hideTimer = setTimeout(function() {
            overlay.classList.add('nt-hud-hidden');
          }, 3000);
        }
      }

      function togglePlay() {
        var vjsPlayer = window.videojs && window.videojs.getAllPlayers && window.videojs.getAllPlayers()[0];
        if (video.paused) {
          if (vjsPlayer && vjsPlayer.play) vjsPlayer.play().catch(function(){ video.play().catch(function(){}); });
          else video.play().catch(function(){});
        } else {
          if (vjsPlayer && vjsPlayer.pause) vjsPlayer.pause();
          else video.pause();
        }
        showHud();
      }

      function flashToast(text) {
        seekToast.textContent = text;
        seekToast.classList.add('nt-show');
        clearTimeout(seekToastTimer);
        seekToastTimer = setTimeout(function() {
          seekToast.classList.remove('nt-show');
        }, 650);
      }

      function seekBy(delta) {
        var dur = isFinite(video.duration) ? video.duration : (video.currentTime + Math.abs(delta) + 1);
        video.currentTime = Math.max(0, Math.min(dur, video.currentTime + delta));
        flashToast((delta > 0 ? '+' : '') + delta + 's');
        showHud();
      }

      function syncPlayIcon() {
        playBtn.innerHTML = video.paused ? SVG_PLAY : SVG_PAUSE;
        if (video.paused) showHud();
      }

      function syncMuteIcon() {
        muteBtn.innerHTML = (video.muted || video.volume === 0) ? SVG_MUTE : SVG_VOL;
        volSlider.value = video.muted ? '0' : String(video.volume);
      }

      window.__ntSyncFsIcon = function() {
        var fs = ctx.isFullscreen || !!document.fullscreenElement;
        fsBtn.innerHTML = fs ? SVG_FS_OUT : SVG_FS_IN;
      };

      window.__ntSyncContext = function() {
        optNotes.style.display = ctx.hasNotes ? 'flex' : 'none';
        optPlaylist.style.display = ctx.hasPlaylist ? 'flex' : 'none';
        if (ctx.title) {
          titlePill.textContent = ctx.title;
          titlePill.classList.add('nt-has-title');
        }
        window.__ntSyncFsIcon();
      };

      function getQualityLabels() {
        var list = [];
        var seen = {};
        if (window.__gbHls && Array.isArray(window.__gbHls.levels) && window.__gbHls.levels.length > 0) {
          window.__gbHls.levels.forEach(function(lv, idx) {
            var lbl = lv.height ? (lv.height + 'p') : (Math.round((lv.bitrate || 0) / 1000) + 'k');
            if (!seen[lbl]) {
              seen[lbl] = true;
              list.push({ label: lbl, sort: lv.height || 0, type: 'hls', idx: idx });
            }
          });
        } else if (window.videojs && window.videojs.getAllPlayers) {
          var vp = window.videojs.getAllPlayers()[0];
          if (vp && typeof vp.qualityLevels === 'function') {
            var ql = vp.qualityLevels();
            for (var i = 0; i < ql.length; i++) {
              var lv2 = ql[i];
              var lbl2 = lv2.height ? (lv2.height + 'p') : (Math.round((lv2.bandwidth || 0) / 1000) + 'k');
              if (!seen[lbl2]) {
                seen[lbl2] = true;
                list.push({ label: lbl2, sort: lv2.height || 0, height: lv2.height, type: 'vjs' });
              }
            }
          }
        }
        list.sort(function(a, b) { return b.sort - a.sort; });
        return list;
      }

      function applyQuality(choice) {
        selectedQuality = choice.label;
        if (choice.type === 'hls' && window.__gbHls) {
          window.__gbHls.currentLevel = choice.label === 'Auto' ? -1 : choice.idx;
        } else if (window.videojs && window.videojs.getAllPlayers) {
          var vp = window.videojs.getAllPlayers()[0];
          if (vp && typeof vp.qualityLevels === 'function') {
            var ql = vp.qualityLevels();
            for (var i = 0; i < ql.length; i++) {
              ql[i].enabled = choice.label === 'Auto' ? true : (ql[i].height === choice.height);
            }
          }
        }
      }

      function renderSettingsMenu() {
        if (activeSettingsPage === 'main') {
          var spdLabel = selectedSpeed === 1 ? 'Normal' : (selectedSpeed + 'x');
          settingsMenu.innerHTML = [
            '<button class="nt-menu-item" data-nt-page="speed" type="button">',
              '<span class="nt-menu-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg><span>Speed</span></span>',
              '<span class="nt-menu-right"><span>' + spdLabel + '</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></span>',
            '</button>',
            '<button class="nt-menu-item" data-nt-page="quality" type="button">',
              '<span class="nt-menu-left"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/></svg><span>Quality</span></span>',
              '<span class="nt-menu-right"><span>' + selectedQuality + '</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></span>',
            '</button>'
          ].join('');
        } else if (activeSettingsPage === 'speed') {
          var speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
          var html = '<button class="nt-menu-item" data-nt-page="main" type="button"><span class="nt-menu-left"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg><span>Speed</span></span></button><div class="nt-divider"></div>';
          speeds.forEach(function(r) {
            var active = Math.abs(selectedSpeed - r) < 0.01;
            html += '<button class="nt-radio-item' + (active ? ' nt-active' : '') + '" data-nt-speed="' + r + '" type="button"><span class="nt-radio-dot"></span><span>' + (r === 1 ? 'Normal' : (r + 'x')) + '</span></button>';
          });
          settingsMenu.innerHTML = html;
        } else if (activeSettingsPage === 'quality') {
          var quals = [{ label: 'Auto', type: window.__gbHls ? 'hls' : 'vjs' }].concat(getQualityLabels());
          var qHtml = '<button class="nt-menu-item" data-nt-page="main" type="button"><span class="nt-menu-left"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg><span>Quality</span></span></button><div class="nt-divider"></div>';
          quals.forEach(function(q, i) {
            var active = selectedQuality === q.label;
            qHtml += '<button class="nt-radio-item' + (active ? ' nt-active' : '') + '" data-nt-qidx="' + i + '" type="button"><span class="nt-radio-dot"></span><span>' + q.label + '</span></button>';
          });
          settingsMenu._quals = quals;
          settingsMenu.innerHTML = qHtml;
        }
      }

      settingsMenu.addEventListener('click', function(e) {
        e.stopPropagation();
        var pageBtn = e.target.closest('[data-nt-page]');
        if (pageBtn) {
          activeSettingsPage = pageBtn.getAttribute('data-nt-page');
          renderSettingsMenu();
          return;
        }
        var spdBtn = e.target.closest('[data-nt-speed]');
        if (spdBtn) {
          selectedSpeed = parseFloat(spdBtn.getAttribute('data-nt-speed')) || 1;
          video.playbackRate = selectedSpeed;
          settingsMenu.classList.remove('nt-open');
          showHud();
          return;
        }
        var qBtn = e.target.closest('[data-nt-qidx]');
        if (qBtn && settingsMenu._quals) {
          var idx = parseInt(qBtn.getAttribute('data-nt-qidx'), 10);
          var chosen = settingsMenu._quals[idx];
          if (chosen) applyQuality(chosen);
          settingsMenu.classList.remove('nt-open');
          showHud();
        }
      });

      var savedVol = parseFloat(localStorage.getItem('videoVolume') || '1');
      if (isFinite(savedVol) && savedVol >= 0 && savedVol <= 1) {
        video.volume = savedVol;
      }

      function updateProgressUI() {
        var dur = video.duration;
        var cur = video.currentTime || 0;
        curEl.textContent = fmtTime(cur);
        if (isFinite(dur) && dur > 0) {
          durEl.textContent = fmtTime(dur);
          var pct = Math.max(0, Math.min(100, (cur / dur) * 100));
          progress.value = String(Math.round((cur / dur) * 1000));
          progress.style.setProperty('--nt-played', pct.toFixed(2) + '%');
          var bufPct = pct;
          try {
            if (video.buffered && video.buffered.length > 0) {
              var bufEnd = video.buffered.end(video.buffered.length - 1);
              bufPct = Math.max(pct, Math.min(100, (bufEnd / dur) * 100));
            }
          } catch (e) {}
          progress.style.setProperty('--nt-buf', bufPct.toFixed(2) + '%');
        } else {
          durEl.textContent = ctx.isLive ? 'LIVE' : '0:00';
        }
      }

      function setBuffering(isBuf) {
        if (isBuf && !video.paused && !video.ended) spinner.classList.add('nt-show');
        else spinner.classList.remove('nt-show');
      }

      video.addEventListener('play', function() { syncPlayIcon(); setBuffering(false); });
      video.addEventListener('pause', function() { syncPlayIcon(); setBuffering(false); });
      video.addEventListener('playing', function() { syncPlayIcon(); setBuffering(false); });
      video.addEventListener('canplay', function() { setBuffering(false); });
      video.addEventListener('seeked', function() { setBuffering(false); updateProgressUI(); });
      video.addEventListener('waiting', function() { setBuffering(true); });
      video.addEventListener('stalled', function() { setBuffering(true); });
      video.addEventListener('timeupdate', updateProgressUI);
      video.addEventListener('progress', updateProgressUI);
      video.addEventListener('durationchange', updateProgressUI);
      video.addEventListener('volumechange', syncMuteIcon);

      progress.addEventListener('input', function(e) {
        e.stopPropagation();
        var dur = video.duration;
        if (isFinite(dur) && dur > 0) {
          video.currentTime = (parseFloat(progress.value) / 1000) * dur;
          updateProgressUI();
        }
        showHud();
      });

      playBtn.addEventListener('click', function(e) { e.stopPropagation(); togglePlay(); });
      rwBtn.addEventListener('click', function(e) { e.stopPropagation(); seekBy(-10); });
      fwBtn.addEventListener('click', function(e) { e.stopPropagation(); seekBy(10); });

      muteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        video.muted = !video.muted;
        if (!video.muted && video.volume === 0) video.volume = 1;
        syncMuteIcon();
        showHud();
      });

      volSlider.addEventListener('input', function(e) {
        e.stopPropagation();
        var v = parseFloat(volSlider.value);
        video.volume = v;
        video.muted = v === 0;
        try { localStorage.setItem('videoVolume', String(v)); } catch (err) {}
        syncMuteIcon();
        showHud();
      });

      settingsBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        moreMenu.classList.remove('nt-open');
        var opening = !settingsMenu.classList.contains('nt-open');
        if (opening) {
          activeSettingsPage = 'main';
          renderSettingsMenu();
          settingsMenu.classList.add('nt-open');
        } else {
          settingsMenu.classList.remove('nt-open');
        }
        showHud();
      });

      moreBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        settingsMenu.classList.remove('nt-open');
        moreMenu.classList.toggle('nt-open');
        showHud();
      });

      backBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        postParent('GB_PLAYER_BACK');
      });

      optReload.addEventListener('click', function(e) {
        e.stopPropagation();
        moreMenu.classList.remove('nt-open');
        postParent('GB_PLAYER_RELOAD');
      });

      optNotes.addEventListener('click', function(e) {
        e.stopPropagation();
        moreMenu.classList.remove('nt-open');
        postParent('GB_PLAYER_OPEN_NOTES');
      });

      optPlaylist.addEventListener('click', function(e) {
        e.stopPropagation();
        moreMenu.classList.remove('nt-open');
        postParent('GB_PLAYER_OPEN_PLAYLIST');
      });

      fsBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        postParent('GB_PLAYER_FULLSCREEN');
        if (window.self === window.top) {
          if (document.fullscreenElement) document.exitFullscreen().catch(function(){});
          else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(function(){});
        }
        showHud();
      });

      var lastTapTime = 0;
      var tapTimer = null;
      gestureLayer.addEventListener('pointerup', function(e) {
        moreMenu.classList.remove('nt-open');
        settingsMenu.classList.remove('nt-open');
        var now = Date.now();
        var rect = gestureLayer.getBoundingClientRect();
        var relX = (e.clientX - rect.left) / Math.max(1, rect.width);

        if (now - lastTapTime < 260) {
          clearTimeout(tapTimer);
          lastTapTime = 0;
          if (relX < 0.35) seekBy(-10);
          else if (relX > 0.65) seekBy(10);
          else fsBtn.click();
          return;
        }
        lastTapTime = now;
        var pt = e.pointerType;
        tapTimer = setTimeout(function() {
          if (pt === 'touch' && overlay.classList.contains('nt-hud-hidden')) {
            showHud();
          } else {
            togglePlay();
          }
        }, 230);
      });

      overlay.addEventListener('pointermove', function() { showHud(); });

      window.addEventListener('keydown', function(e) {
        if (e.target && ['INPUT', 'TEXTAREA'].indexOf(e.target.tagName) !== -1) return;
        var key = (e.key || '').toLowerCase();
        if (key === 'arrowleft' || key === 'j') {
          e.preventDefault(); seekBy(-10);
        } else if (key === 'arrowright' || key === 'l') {
          e.preventDefault(); seekBy(10);
        } else if (e.key === ' ' || key === 'k') {
          e.preventDefault(); togglePlay();
        } else if (key === 'm') {
          e.preventDefault(); muteBtn.click();
        } else if (key === 'f') {
          e.preventDefault(); fsBtn.click();
        }
      });

      syncPlayIcon();
      syncMuteIcon();
      updateProgressUI();
      window.__ntSyncContext();
      showHud();
      postParent('GB_PLAYER_UI_READY');
    }

    function waitForVideo() {
      var video = document.querySelector('video');
      if (video) {
        mountNtHud(video);
        return;
      }
      setTimeout(waitForVideo, 120);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitForVideo);
    else waitForVideo();
  })();
</script>`;
}

function extractYoutubeVideoId(rawUrl: string): string {
  const s = (rawUrl || '').trim();
  if (!s) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) {
      return u.pathname.replace(/^\/+/, '').split('/')[0] || '';
    }
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\/(?:embed|live|shorts|v)\/([a-zA-Z0-9_-]{6,})/);
      if (m) return m[1];
    }
  } catch {
    // ignore invalid URL
  }
  return '';
}

function renderLocalYoutubePlayerHtml(ytUrlOrId: string, isLive: boolean): string {
  const vid = extractYoutubeVideoId(ytUrlOrId);
  const embedSrc = vid
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
    : ytUrlOrId;
  const safeSrc = JSON.stringify(embedSrc);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GB STUDY Live Player</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; color: #fff; font-family: system-ui, sans-serif; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: 0; display: block; background: #000; }
    .live-pill { position: fixed; top: 14px; left: 68px; z-index: 20; background: #dc2626; color: #fff; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; letter-spacing: 0.06em; pointer-events: none; }
  </style>
</head>
<body>
  ${isLive ? '<div class="live-pill">LIVE</div>' : ''}
  <iframe id="yt" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>
  <script>
    document.getElementById('yt').src = ${safeSrc};
  </script>
</body>
</html>`;
}

function renderLocalEmbedPlayerHtml(embedUrl: string): string {
  const safeSrc = JSON.stringify(embedUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GB STUDY Player</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; color: #fff; font-family: system-ui, sans-serif; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: 0; display: block; background: #000; }
  </style>
</head>
<body>
  <iframe id="emb" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>
  <script>
    document.getElementById('emb').src = ${safeSrc};
  </script>
</body>
</html>`;
}

function renderLocalHlsPlayerHtml(hlsUrl: string, isLive: boolean): string {
  const safeUrl = JSON.stringify(hlsUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GB STUDY Player</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.8/hls.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; color: #fff; font-family: system-ui, sans-serif; overflow: hidden; }
    .wrap { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
    video { width: 100%; height: 100%; max-height: 100dvh; background: #000; object-fit: contain; }
  </style>
</head>
<body>
  <div class="wrap">
    <video id="video" autoplay playsinline controlsList="nodownload"></video>
  </div>
  <script>
    window.__gbIsLive = ${isLive ? 'true' : 'false'};
    (function() {
      var video = document.getElementById('video');
      var src = ${safeUrl};
      if (window.Hls && window.Hls.isSupported()) {
        var hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: ${isLive ? 'true' : 'false'},
          liveSyncDurationCount: 3,
          backBufferLength: 60
        });
        window.__gbHls = hls;
        var recoverAttempts = 0;
        hls.on(window.Hls.Events.ERROR, function(_ev, data) {
          if (data && data.fatal && recoverAttempts < 4) {
            recoverAttempts += 1;
            if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
            } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            }
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.MANIFEST_PARSED, function() {
          video.play().catch(function(){});
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.addEventListener('loadedmetadata', function() {
          video.play().catch(function(){});
        });
      }
    })();
  </script>
  ${buildGbStudyAddonHtml()}
</body>
</html>`;
}

async function proxyToUpstream(req: Request, res: Response, timeoutMs = 15000) {
  const targetUrl = `${UPSTREAM_BASE}${req.originalUrl}`;
  const method = req.method.toUpperCase();
  const headers = makeUpstreamHeaders(req);

  const init: RequestInit = {
    method,
    headers,
    redirect: 'manual',
  };

  if (method !== 'GET' && method !== 'HEAD') {
    const rawBuf = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === 'string'
        ? Buffer.from(req.body)
        : req.body && Object.keys(req.body).length > 0
          ? Buffer.from(JSON.stringify(req.body))
          : undefined;

    if (rawBuf && rawBuf.length > 0) {
      init.body = new Uint8Array(rawBuf);
    }
  }

  try {
    let upstreamRes = await fetchWithTimeout(targetUrl, init, timeoutMs);

    if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
      const loc = upstreamRes.headers.get('location');
      if (loc) {
        if (loc.startsWith('/') || loc.startsWith(UPSTREAM_BASE)) {
          const nextUrl = loc.startsWith('/') ? `${UPSTREAM_BASE}${loc}` : loc;
          upstreamRes = await fetchWithTimeout(
            nextUrl,
            {
              method: 'GET',
              headers: makeUpstreamHeaders(req),
              redirect: 'follow',
            },
            timeoutMs
          );
        } else {
          return res.redirect(upstreamRes.status, loc);
        }
      }
    }

    res.status(upstreamRes.status);
    for (const h of SAFE_RESPONSE_HEADERS) {
      const val = upstreamRes.headers.get(h);
      if (val) res.setHeader(h, val);
    }

    const contentType = (upstreamRes.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('text/html')) {
      let html = await upstreamRes.text();
      if (
        req.originalUrl.startsWith('/api/v1/stream/watch/') &&
        html.includes('USER_TRIGGER_AUTH')
      ) {
        const ticketMeta = recentTicketMeta.get(req.originalUrl);
        if (ticketMeta) {
          recentTicketMeta.delete(req.originalUrl);
          try {
            const retryHeaders = makeUpstreamHeaders();
            retryHeaders['content-type'] = 'application/json';
            const retryRes = await fetchWithTimeout(
              `${UPSTREAM_BASE}/api/v1/tb/create-stream-ticket`,
              {
                method: 'POST',
                headers: retryHeaders,
                body: JSON.stringify({ ...ticketMeta, token: '' }),
              },
              8000
            );
            let retryJson: any = await retryRes.json().catch(() => null);
            if (retryJson && retryJson._enc === 1) retryJson = decryptPayload(retryJson);
            if (retryJson?.watchUrl) {
              const wRes = await fetchWithTimeout(
                `${UPSTREAM_BASE}${retryJson.watchUrl}`,
                { headers: makeUpstreamHeaders(req) },
                8000
              );
              if (wRes.ok) {
                html = await wRes.text();
              }
            }
          } catch {
            // keep original html
          }
        }
      }
      html = html.replace(/<script[^>]+src="\/_aistudio-iframe\.js[^"]*"[^>]*><\/script>/gi, '');
      html = rebrandText(html);
      return res.send(html);
    }

    if (
      contentType.includes('application/json') &&
      (req.originalUrl.startsWith('/api/v1/system/config') ||
        req.originalUrl.startsWith('/api/v1/tb-auth/'))
    ) {
      const rawText = await upstreamRes.text();
      try {
        const parsed = JSON.parse(rawText);
        const wasEncrypted = parsed && typeof parsed === 'object' && parsed._enc === 1;
        let data = wasEncrypted ? decryptPayload(parsed) : parsed;

        if (req.originalUrl.startsWith('/api/v1/system/config') && data && typeof data === 'object') {
          data.keyGeneratorEnabled = false;
        }
        data = rebrandSafeStrings(data);

        const finalBody = wasEncrypted ? encryptPayload(data) : data;
        return res.json(finalBody);
      } catch {
        return res.send(rawText);
      }
    }

    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    return res.send(buf);
  } catch (err: any) {
    console.error(`Upstream proxy error for ${req.originalUrl}:`, err?.message || err);
    return res.status(502).json({
      success: false,
      error: 'Unable to reach media server right now. Please retry.',
    });
  }
}

function parseRawJsonBody(req: Request): { payload: any; wasEncrypted: boolean } {
  const rawStr = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body || {});
  try {
    const parsed = JSON.parse(rawStr || '{}');
    const wasEncrypted = !!(parsed && typeof parsed === 'object' && parsed._enc === 1);
    return {
      payload: wasEncrypted ? decryptPayload(parsed) : parsed,
      wasEncrypted,
    };
  } catch {
    return { payload: {}, wasEncrypted: false };
  }
}

function sendAuthResponse(req: Request, res: Response, status: number, data: any, preferEncrypted: boolean) {
  const cleaned = rebrandSafeStrings(data);
  const shouldEncrypt = preferEncrypted || req.headers['x-spidy-e2ee-req'] === '1';
  return res.status(status).json(shouldEncrypt ? encryptPayload(cleaned) : cleaned);
}

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isDev = process.env.NODE_ENV !== 'production';

// Security headers & strict iframe embedding protection (matching GB STUDY Shield)
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://*.google.com https://*.scf.usercontent.goog https://gb-study-*.ai.studio https://ais-dev-bh67bu67g7ziwrcfvungkm-26974065279.asia-southeast1.run.app https://ais-pre-bh67bu67g7ziwrcfvungkm-26974065279.asia-southeast1.run.app http://localhost:* http://127.0.0.1:*;"
  );
  next();
});

// Cryptographic domain, origin, brand/logo integrity & anti-clone shield for API routes
app.use(['/api/v1', '/batches.json'], (req, res, next) => {
  if (!SERVER_LOGO_INTACT) {
    return res.status(403).json({
      success: false,
      error: 'मैं इस वेबसाइट का नाम और आइकन बदल नहीं सकती। ब्रांड या आइकन से छेड़छाड़ ब्लॉक है।',
    });
  }

  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (originHeader) {
    try {
      const originHost = new URL(originHeader).hostname;
      if (!isAllowedClientHost(originHost)) {
        return res.status(403).json({ success: false, error: 'Unauthorized origin blocked' });
      }
    } catch {
      return res.status(403).json({ success: false, error: 'Invalid origin blocked' });
    }
  }

  const refererHeader = typeof req.headers.referer === 'string' ? req.headers.referer : '';
  if (refererHeader) {
    try {
      const refHost = new URL(refererHeader).hostname;
      if (!isAllowedClientHost(refHost)) {
        return res.status(403).json({ success: false, error: 'Unauthorized referer blocked' });
      }
    } catch {
      return res.status(403).json({ success: false, error: 'Invalid referer blocked' });
    }
  }

  const gbNonce = typeof req.headers['x-gb-nonce'] === 'string' ? req.headers['x-gb-nonce'] : '';
  const gbSig = typeof req.headers['x-gb-sig'] === 'string' ? req.headers['x-gb-sig'] : '';
  const gbBrand = typeof req.headers['x-gb-dom-brand'] === 'string' ? req.headers['x-gb-dom-brand'] : '';
  const gbLogoSha = typeof req.headers['x-gb-logo-sha'] === 'string' ? req.headers['x-gb-logo-sha'] : '';
  const hasAnyShieldHeader = !!(gbNonce || gbSig || gbBrand || gbLogoSha);

  const reqPath = req.originalUrl.split('?')[0];
  const isProtectedPost =
    req.method.toUpperCase() === 'POST' &&
    (reqPath === '/api/v1/tb/create-stream-ticket' ||
      reqPath === '/api/v1/tb/save-student-session' ||
      reqPath.startsWith('/api/v1/tb-auth/'));

  const isClearanceRequiredApi =
    isProtectedPost ||
    reqPath === '/api/v1/tb/create-stream-ticket' ||
    reqPath === '/api/v1/tb/shared-session' ||
    reqPath === '/api/v1/tb/save-student-session' ||
    reqPath.startsWith('/api/v1/tb-auth/') ||
    reqPath.startsWith('/api/v1/category/tree-user/') ||
    reqPath === '/api/v1/tb/active-live-streams' ||
    reqPath === '/batches.json';

  if (hasAnyShieldHeader || isClearanceRequiredApi) {
    if (gbBrand !== OFFICIAL_BRAND || gbLogoSha !== OFFICIAL_LOGO_SHA256) {
      return res.status(403).json({
        success: false,
        error: 'मैं इस वेबसाइट का नाम (GB STUDY) और आइकन बदल नहीं सकती। अनधिकृत क्लोन ब्लॉक है।',
      });
    }
    const expectedSig = signGbRequestServer(reqPath, gbNonce);
    if (!gbNonce || gbSig !== expectedSig) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized cryptographic signature rejected.',
      });
    }
  }

  const clientIp = getClientIp(req) || 'unknown';
  if (reqPath === '/api/v1/security/challenge' || reqPath === '/api/v1/security/verify-human') {
    if (!checkRateLimit(`sec:${clientIp}`, 40, 60 * 1000)) {
      return res.status(429).json({ success: false, error: 'Too many verification attempts.' });
    }
    return next();
  }

  if (isClearanceRequiredApi) {
    const cookies = parseCookieHeader(req.headers.cookie);
    const clearanceHeader =
      typeof req.headers['x-gb-clearance'] === 'string' ? req.headers['x-gb-clearance'] : '';
    if (!verifyClearanceToken(clearanceHeader) && !verifyClearanceToken(cookies['gb_clearance'])) {
      // Return HTTP 428 instead of 403 so reverse proxies (nginx error_page 403) do not strip JSON needsSecurityCheck
      return res.status(428).json({
        success: false,
        needsSecurityCheck: true,
        error: 'Cloud security verification required.',
      });
    }
  }

  if (reqPath.startsWith('/api/v1/tb-auth/')) {
    if (!checkRateLimit(`auth:${clientIp}`, 20, 5 * 60 * 1000)) {
      return res.status(429).json({
        success: false,
        message: 'बहुत अधिक प्रयास किए गए। कृपया कुछ मिनट बाद प्रयास करें।',
      });
    }
  } else if (reqPath === '/api/v1/tb/create-stream-ticket') {
    if (!checkRateLimit(`ticket:${clientIp}`, 60, 60 * 1000)) {
      return res.status(429).json({ success: false, error: 'Too many stream requests. Please slow down.' });
    }
  } else if (reqPath === '/api/v1/pdf-proxy') {
    if (!checkRateLimit(`pdf:${clientIp}`, 60, 60 * 1000)) {
      return res.status(429).json({ success: false, error: 'Too many document requests.' });
    }
  }

  next();
});

// Raw body for encrypted/binary proxied routes
app.use(['/api', '/vg', '/batches.json'], express.raw({ type: '*/*', limit: '50mb' }));

// Human / Bot Security Gate endpoints (matching GB Shield Proof-of-Work verification)
app.get('/api/v1/security/challenge', (req: Request, res: Response) => {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Date.now();
  const difficulty = 2;
  const challengeSig = hmacHex(`CHAL:${nonce}:${ts}:${difficulty}`);
  return sendAuthResponse(
    req,
    res,
    200,
    { success: true, nonce, ts, difficulty, challengeSig },
    false
  );
});

app.post('/api/v1/security/verify-human', (req: Request, res: Response) => {
  const { payload, wasEncrypted } = parseRawJsonBody(req);
  const nonce = String(payload?.nonce || '');
  const ts = Number(payload?.ts || 0);
  const difficulty = Number(payload?.difficulty || 2);
  const challengeSig = String(payload?.challengeSig || '');
  const solution = String(payload?.solution || '');

  if (!nonce || !ts || !challengeSig || !solution || Date.now() - ts > 2 * 60 * 1000) {
    return sendAuthResponse(
      req,
      res,
      403,
      { success: false, verified: false, error: 'Security challenge expired. Please retry.' },
      wasEncrypted
    );
  }

  if (payload?.automatedFlag === 1) {
    return sendAuthResponse(
      req,
      res,
      403,
      { success: false, verified: false, error: 'Automated bot environment blocked.' },
      wasEncrypted
    );
  }

  const expectedSig = hmacHex(`CHAL:${nonce}:${ts}:${difficulty}`);
  if (challengeSig !== expectedSig) {
    return sendAuthResponse(
      req,
      res,
      403,
      { success: false, verified: false, error: 'Invalid challenge signature.' },
      wasEncrypted
    );
  }

  const digest = crypto.createHash('sha256').update(`${nonce}:${solution}`).digest('hex');
  const prefix = '0'.repeat(Math.max(1, Math.min(4, difficulty)));
  if (!digest.startsWith(prefix)) {
    return sendAuthResponse(
      req,
      res,
      403,
      { success: false, verified: false, error: 'Bot verification proof invalid.' },
      wasEncrypted
    );
  }

  const clearanceToken = issueClearanceToken();
  const isHttps =
    req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  res.setHeader(
    'Set-Cookie',
    `gb_clearance=${encodeURIComponent(clearanceToken)}; Path=/; Max-Age=86400; HttpOnly; ${
      isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax'
    }`
  );

  return sendAuthResponse(
    req,
    res,
    200,
    { success: true, verified: true, clearanceToken },
    wasEncrypted
  );
});

// Local system config — 100% independent of upstream website (never enables keygen or anti-inspect lockouts)
app.get('/api/v1/system/config', (req: Request, res: Response) => {
  return sendAuthResponse(
    req,
    res,
    200,
    {
      success: true,
      keyGeneratorEnabled: false,
      antiInspectEnabled: false,
      telegramModalEnabled: false,
      announcementText: '',
    },
    false
  );
});

// Direct Target Board OTP & Auth handlers (server-side session sharing + permanent first-number lock)
app.post('/api/v1/tb-auth/send-otp', async (req: Request, res: Response) => {
  const { payload, wasEncrypted } = parseRawJsonBody(req);
  const cleanMobile = String(payload?.mobile || '').replace(/[^0-9]/g, '').slice(-10);
  if (cleanMobile.length !== 10) {
    return sendAuthResponse(
      req,
      res,
      400,
      { success: false, message: 'कृपया 10 अंकों का सही मोबाइल नंबर दर्ज करें' },
      wasEncrypted
    );
  }

  const lockCheck = checkPermanentMobileLock(cleanMobile);
  if (!lockCheck.allowed) {
    return sendAuthResponse(
      req,
      res,
      400,
      {
        success: false,
        isLocked: true,
        lockedMobileHint: lockCheck.lockedHint,
        message: lockCheck.message,
      },
      wasEncrypted
    );
  }

  try {
    const directRes = await fetchWithTimeout(
      `${TB_DIRECT_API}/auth/send-otp`,
      {
        method: 'POST',
        headers: makeTbDirectHeaders(),
        body: JSON.stringify({ mobile: cleanMobile }),
      },
      10000
    );
    const directText = await directRes.text();
    let directData: any = {};
    try {
      directData = JSON.parse(directText);
    } catch {
      directData = {};
    }

    if (directRes.ok) {
      return sendAuthResponse(
        req,
        res,
        200,
        {
          success: true,
          smsSent: true,
          isLocked: !!permanentLockedMobile,
          lockedMobileHint: getMaskedMobileHint(permanentLockedMobile),
          message: 'OTP आपके मोबाइल पर SMS द्वारा भेज दिया गया है!',
        },
        wasEncrypted
      );
    }

    if (directRes.status === 429) {
      return sendAuthResponse(
        req,
        res,
        200,
        {
          success: true,
          alreadySent: true,
          message: 'OTP पहले ही भेजा जा चुका है! कृपया SMS जांचें या 60 सेकंड बाद Resend करें।',
        },
        wasEncrypted
      );
    }

    if (directRes.status >= 400 && directRes.status < 500) {
      const safeStatus = directRes.status === 403 ? 400 : directRes.status;
      return sendAuthResponse(
        req,
        res,
        safeStatus,
        {
          success: false,
          message: directData?.message || directData?.error || 'OTP भेजने में त्रुटि हुई',
        },
        wasEncrypted
      );
    }
  } catch (err: any) {
    console.error('Direct send-otp error:', err?.message || err);
  }

  return sendAuthResponse(
    req,
    res,
    502,
    { success: false, message: 'OTP सर्वर से संपर्क नहीं हो पा रहा है। कृपया कुछ देर बाद पुनः प्रयास करें।' },
    wasEncrypted
  );
});

app.post('/api/v1/tb-auth/verify-otp', async (req: Request, res: Response) => {
  const { payload, wasEncrypted } = parseRawJsonBody(req);
  const cleanMobile = String(payload?.mobile || '').replace(/[^0-9]/g, '').slice(-10);
  const code = String(payload?.code || '').replace(/[^0-9]/g, '').trim();

  if (cleanMobile.length !== 10 || code.length !== 6) {
    return sendAuthResponse(
      req,
      res,
      400,
      { success: false, message: 'कृपया सही मोबाइल नंबर और 6 अंकों का OTP दर्ज करें' },
      wasEncrypted
    );
  }

  const lockCheck = checkPermanentMobileLock(cleanMobile);
  if (!lockCheck.allowed) {
    return sendAuthResponse(
      req,
      res,
      400,
      {
        success: false,
        isLocked: true,
        lockedMobileHint: lockCheck.lockedHint,
        message: lockCheck.message,
      },
      wasEncrypted
    );
  }

  try {
    const directRes = await fetchWithTimeout(
      `${TB_DIRECT_API}/auth/verify-otp`,
      {
        method: 'POST',
        headers: makeTbDirectHeaders(),
        body: JSON.stringify({ mobile: cleanMobile, code }),
      },
      10000
    );
    const directText = await directRes.text();
    let directData: any = {};
    try {
      directData = JSON.parse(directText);
    } catch {
      console.warn('Non-JSON verify-otp response:', directRes.status, directText.slice(0, 180));
      directData = {};
    }

    const token =
      directData?.token || directData?.accessToken || directData?.data?.token || directData?.data?.accessToken || '';
    const tempToken = directData?.tempToken || directData?.data?.tempToken || '';
    const userObj = directData?.user || directData?.data?.user;
    const sessionId = directData?.sessionId || directData?.data?.sessionId || '';

    if (directRes.ok) {
      if (tempToken && !token) {
        return sendAuthResponse(
          req,
          res,
          200,
          {
            success: true,
            isNewUser: true,
            tempToken,
          },
          wasEncrypted
        );
      }
      if (token) {
        persistSharedSession({
          token,
          user: userObj,
          mobile: cleanMobile,
          sessionId,
        });
      }
      ensurePermanentMobileLocked(cleanMobile);
      lastBatchesLiveSyncAt = 0;
      cachedLiveStreamsAt = 0;
      lastTreesFullSyncAt = 0;
      treeFreshAt.clear();
      void syncAllTreesInBackground(true);
      return sendAuthResponse(
        req,
        res,
        200,
        {
          success: true,
          authenticated: true,
          isLocked: true,
          lockedMobileHint: getMaskedMobileHint(permanentLockedMobile || cleanMobile),
        },
        wasEncrypted
      );
    }

    if (directRes.status >= 400 && directRes.status < 500) {
      // Never return raw HTTP 403 to browser through nginx error_page 403 interception
      const safeStatus = directRes.status === 403 ? 400 : directRes.status;
      return sendAuthResponse(
        req,
        res,
        safeStatus,
        {
          success: false,
          message:
            directData?.message ||
            directData?.error ||
            (directRes.status === 403
              ? 'OTP सत्यापन अस्थायी रूप से अस्वीकृत हुआ। कृपया नया OTP मंगाकर पुनः प्रयास करें।'
              : 'गलत OTP कोड। कृपया सही OTP दर्ज करें।'),
        },
        wasEncrypted
      );
    }
  } catch (err: any) {
    console.error('Direct verify-otp error:', err?.message || err);
  }

  return sendAuthResponse(
    req,
    res,
    502,
    { success: false, message: 'OTP सत्यापन में त्रुटि हुई। कृपया पुनः प्रयास करें।' },
    wasEncrypted
  );
});

app.post('/api/v1/tb-auth/complete-registration', async (req: Request, res: Response) => {
  const { payload, wasEncrypted } = parseRawJsonBody(req);
  const cleanMobile = String(payload?.mobile || '').replace(/[^0-9]/g, '').slice(-10);
  const tempToken = String(payload?.tempToken || '').trim();
  const fullName = String(payload?.fullName || '').trim();
  const classId = String(payload?.classId || '6963936ceefd2beed5d5119b');
  const stateBoardId = String(payload?.stateBoardId || '6963925feefd2beed5d50f7b');
  const mediumId = String(payload?.mediumId || '696398c0eefd2beed5d51922');
  const city = String(payload?.city || 'Patna');

  const lockCheck = checkPermanentMobileLock(cleanMobile);
  if (!lockCheck.allowed) {
    return sendAuthResponse(
      req,
      res,
      400,
      {
        success: false,
        isLocked: true,
        lockedMobileHint: lockCheck.lockedHint,
        message: lockCheck.message,
      },
      wasEncrypted
    );
  }

  if (tempToken && fullName) {
    try {
      const step1 = await fetchWithTimeout(
        `${TB_DIRECT_API}/auth/register-step-1`,
        {
          method: 'POST',
          headers: makeTbDirectHeaders({ Authorization: `Bearer ${tempToken}` }),
          body: JSON.stringify({ fullName }),
        },
        10000
      );

      if (step1.ok) {
        const step2 = await fetchWithTimeout(
          `${TB_DIRECT_API}/auth/register-step-2`,
          {
            method: 'POST',
            headers: makeTbDirectHeaders({ Authorization: `Bearer ${tempToken}` }),
            body: JSON.stringify({ classId, stateBoardId, mediumId, city }),
          },
          10000
        );
        const step2Data: any = await step2.json().catch(() => ({}));
        const step2Token =
          step2Data?.token || step2Data?.accessToken || step2Data?.data?.token || '';
        const step2User = step2Data?.user || step2Data?.data?.user;
        if (step2.ok && (step2Token || step2User)) {
          const finalToken = step2Token || tempToken;
          persistSharedSession({
            token: finalToken,
            user: step2User || { fullName },
            mobile: cleanMobile,
          });
          ensurePermanentMobileLocked(cleanMobile);
          lastBatchesLiveSyncAt = 0;
          cachedLiveStreamsAt = 0;
          lastTreesFullSyncAt = 0;
          treeFreshAt.clear();
          void syncAllTreesInBackground(true);
          return sendAuthResponse(
            req,
            res,
            200,
            {
              success: true,
              authenticated: true,
              isLocked: true,
              lockedMobileHint: getMaskedMobileHint(permanentLockedMobile || cleanMobile),
            },
            wasEncrypted
          );
        }
      }
    } catch (err: any) {
      console.error('Direct complete-registration error:', err?.message || err);
    }
  }

  return sendAuthResponse(
    req,
    res,
    502,
    { success: false, message: 'पंजीकरण पूरा नहीं हो सका। कृपया पुनः प्रयास करें।' },
    wasEncrypted
  );
});

// Privacy-hardened shared session endpoint: NEVER exposes token, name, email, or full mobile number to browsers
app.get('/api/v1/tb/shared-session', (req: Request, res: Response) => {
  const hasSession = !!(sharedStudentSession?.token && sharedStudentSession.token.length > 20);
  const isLocked = !!(permanentLockedMobile && permanentLockedMobile.length === 10);
  return sendAuthResponse(
    req,
    res,
    200,
    {
      success: true,
      hasSession,
      authenticated: hasSession,
      isLocked,
      lockedMobileHint: getMaskedMobileHint(permanentLockedMobile),
    },
    false
  );
});

app.post('/api/v1/tb/save-student-session', async (req: Request, res: Response) => {
  const { payload, wasEncrypted } = parseRawJsonBody(req);
  const candidateToken = typeof payload?.token === 'string' ? payload.token.trim() : '';
  const candidateMobile = String(payload?.mobile ?? payload?.user?.mobile ?? '')
    .replace(/[^0-9]/g, '')
    .slice(-10);
  const lockCheck = checkPermanentMobileLock(candidateMobile);
  if (!lockCheck.allowed) {
    return sendAuthResponse(
      req,
      res,
      200,
      { success: true, saved: false, isLocked: true, lockedMobileHint: lockCheck.lockedHint },
      wasEncrypted
    );
  }
  if (!isValidTargetBoardJwt(candidateToken, payload?.mobile ?? payload?.user?.mobile, payload?.sessionId)) {
    return sendAuthResponse(req, res, 200, { success: true, saved: false }, wasEncrypted);
  }
  try {
    const checkRes = await fetchWithTimeout(
      `${TB_DIRECT_API}/auth/user/details`,
      {
        headers: makeTbDirectHeaders({ Authorization: `Bearer ${candidateToken}` }),
      },
      5000
    );
    if (checkRes.status === 401 || checkRes.status === 403) {
      return sendAuthResponse(req, res, 200, { success: true, saved: false }, wasEncrypted);
    }
  } catch {
    // Allow saving if Target Board user check had a transient network issue, as JWT format already passed
  }

  const saved = persistSharedSession({
    token: candidateToken,
    user: payload?.user,
    mobile: candidateMobile,
    sessionId: payload?.sessionId,
  });
  if (saved) {
    lastBatchesLiveSyncAt = 0;
    cachedLiveStreamsAt = 0;
    lastTreesFullSyncAt = 0;
    treeFreshAt.clear();
    void syncAllTreesInBackground(true);
  }
  return sendAuthResponse(req, res, 200, { success: true, saved }, wasEncrypted);
});

let upstreamRetryAfter = 0;
let lastBatchesLiveSyncAt = 0;

function canTryUpstream(): boolean {
  return Date.now() >= upstreamRetryAfter;
}

function markUpstreamFailed() {
  upstreamRetryAfter = Date.now() + 30_000;
}

function getLocalThumbFileMap(): Map<string, string> {
  const thumbMap = new Map<string, string>();
  try {
    const thumbDir = path.join(__dirname, 'public', 'batch_thumbs');
    if (fs.existsSync(thumbDir)) {
      for (const f of fs.readdirSync(thumbDir)) {
        const ext = path.extname(f).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          thumbMap.set(path.basename(f, ext), `/batch_thumbs/${f}`);
        }
      }
    }
  } catch {
    // ignore
  }
  return thumbMap;
}

function normalizeStudyxThumbnail(rawThumb: any, rawId: string, title: string, classLabel: string, localThumbs: Map<string, string>): string {
  if (rawId && localThumbs.has(rawId)) {
    return localThumbs.get(rawId)!;
  }
  const s = typeof rawThumb === 'string' ? rawThumb.trim() : '';
  if (s.startsWith('/api/tb/image')) {
    const qIdx = s.indexOf('?');
    return qIdx !== -1 ? `/api/v1/tb-image${s.slice(qIdx)}` : '/default-thumbnail.png';
  }
  if (s.startsWith('/api/poster') || !s) {
    return `/api/v1/gb-poster?t=${encodeURIComponent(rebrandText(title))}&c=${encodeURIComponent(classLabel || 'Batch')}`;
  }
  if (s.startsWith('http://') || s.startsWith('https://')) {
    return `/api/v1/tb-image?url=${encodeURIComponent(s)}`;
  }
  return s || '/default-thumbnail.png';
}

async function fetchStudyxBatches(): Promise<any[] | null> {
  try {
    const r = await fetchWithTimeout(
      `${STUDYX_BASE}/api/courses`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      },
      9000
    );
    if (!r.ok) return null;
    const json: any = await r.json().catch(() => null);
    const list = Array.isArray(json?.courses) ? json.courses : [];
    if (list.length === 0) return null;

    const localThumbs = getLocalThumbFileMap();
    const mapped = list
      .map((c: any) => {
        const rawSlug = String(c.id || c.slug || '').trim();
        const canonicalId = rawSlug.replace(/^tb-/i, '');
        if (!canonicalId) return null;
        const cleanTitle = rebrandText(String(c.title || c.name || 'Course Batch').trim());
        const classLabel = rebrandText(String(c.classLabel || '').trim());
        return {
          id: canonicalId,
          _id: canonicalId,
          sourceId: rawSlug,
          title: cleanTitle,
          thumbnail: normalizeStudyxThumbnail(c.thumbnail, canonicalId, cleanTitle, classLabel, localThumbs),
          category: c.category || '',
          classLabel,
        };
      })
      .filter(Boolean);

    if (mapped.length > 0) {
      const payload = { source: 'studyx', new: mapped };
      try {
        fs.mkdirSync(CATALOG_CACHE_DIR, { recursive: true });
        fs.writeFileSync(BATCHES_CACHE_FILE, JSON.stringify(payload), 'utf8');
      } catch {
        // ignore disk write error
      }
      return mapped;
    }
  } catch {
    // ignore fetch error
  }
  return null;
}

async function fetchStudyxCourseTree(courseId: string): Promise<any[] | null> {
  const canonicalId = courseId.replace(/^tb-/i, '').trim();
  const studyxCourseId = `tb-${canonicalId}`;
  const reqHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json',
  };

  try {
    const courseRes = await fetchWithTimeout(
      `${STUDYX_BASE}/api/courses/${encodeURIComponent(studyxCourseId)}`,
      { headers: reqHeaders },
      9000
    );
    if (!courseRes.ok) return null;
    const courseJson: any = await courseRes.json().catch(() => null);
    const topSubjects = Array.isArray(courseJson?.subjects) ? courseJson.subjects : [];
    if (topSubjects.length === 0) return [];

    const subjectDataMap = new Map<string, any>();
    const pendingIds: string[] = [];
    const seenIds = new Set<string>();

    for (const s of [...topSubjects].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))) {
      const sid = String(s?.id || '').trim();
      if (sid && !seenIds.has(sid)) {
        seenIds.add(sid);
        pendingIds.push(sid);
      }
    }

    let fetchedCount = 0;
    while (pendingIds.length > 0 && fetchedCount < 80) {
      const batch = pendingIds.splice(0, 6);
      const responses = await Promise.all(
        batch.map(async (sid) => {
          fetchedCount += 1;
          try {
            const sr = await fetchWithTimeout(
              `${STUDYX_BASE}/api/subjects/${encodeURIComponent(sid)}`,
              { headers: reqHeaders },
              9000
            );
            if (!sr.ok) return { sid, data: null };
            const sj: any = await sr.json().catch(() => null);
            return { sid, data: sj };
          } catch {
            return { sid, data: null };
          }
        })
      );

      for (const { sid, data } of responses) {
        if (!data) continue;
        subjectDataMap.set(sid, data);
        const subs = Array.isArray(data.subfolders) ? data.subfolders : [];
        for (const sub of subs) {
          const subId = String(sub?.id || '').trim();
          if (subId && !seenIds.has(subId)) {
            seenIds.add(subId);
            pendingIds.push(subId);
          }
        }
      }
    }

    const buildFolderFromSubject = (sid: string, fallbackName: string, ancestry: Set<string>): any | null => {
      if (ancestry.has(sid)) return null;
      const data = subjectDataMap.get(sid);
      if (!data) return null;

      const nextAncestry = new Set(ancestry);
      nextAncestry.add(sid);

      const children: any[] = [];
      const subfolders = [...(Array.isArray(data.subfolders) ? data.subfolders : [])].sort(
        (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)
      );
      for (const sub of subfolders) {
        const subId = String(sub?.id || '').trim();
        if (!subId) continue;
        const childNode = buildFolderFromSubject(subId, String(sub?.name || 'Subject'), nextAncestry);
        if (childNode) children.push(childNode);
      }

      const chapters = [...(Array.isArray(data.chapters) ? data.chapters : [])].sort(
        (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)
      );
      for (const ch of chapters) {
        const videos = [...(Array.isArray(ch.videos) ? ch.videos : [])]
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
          .map((v: any, idx: number) => ({
            _id: String(v.id || `${ch.id}:v${idx}`),
            title: rebrandText(String(v.title || 'Lecture Video').trim()),
            type: 'video',
            tpAssetId: String(v.assetId || '').trim(),
            assetId: String(v.assetId || '').trim(),
            ...(typeof v.hlsUrl === 'string' && v.hlsUrl.startsWith('http') ? { hlsUrl: v.hlsUrl } : {}),
            sequence: v.order ?? idx,
          }));

        const pdfs = [...(Array.isArray(ch.pdfs) ? ch.pdfs : [])]
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
          .filter((p: any) => typeof p?.url === 'string' && p.url.trim().length > 0)
          .map((p: any, idx: number) => {
            const pTitle = rebrandText(String(p.title || 'Class Notes').trim());
            return {
              _id: String(p.id || `${ch.id}:p${idx}`),
              title: pTitle,
              type: 'pdf',
              pdf: {
                url: p.url.trim(),
                fileName: `${pTitle.replace(/[^\w\s-]/g, '_') || 'notes'}.pdf`,
              },
              sequence: p.order ?? idx,
            };
          });

        if (videos.length === 0 && pdfs.length === 0) continue;

        children.push({
          _id: String(ch.id || Math.random()),
          name: rebrandText(String(ch.name || 'Chapter').trim()),
          children: [],
          lessons: videos,
          contents: pdfs,
        });
      }

      if (children.length === 0) return null;

      return {
        _id: String(data.subject?.id || sid),
        name: rebrandText(String(data.subject?.name || fallbackName || 'Subject').trim()),
        children,
        lessons: [],
        contents: [],
      };
    };

    const tree: any[] = [];
    const sortedRoots = [...topSubjects].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    for (const rootSubj of sortedRoots) {
      const sid = String(rootSubj?.id || '').trim();
      if (!sid) continue;
      const node = buildFolderFromSubject(sid, String(rootSubj?.name || 'Subject'), new Set());
      if (node) tree.push(node);
    }

    const cleaned = rebrandSafeStrings(tree);
    try {
      fs.mkdirSync(TREE_CACHE_DIR, { recursive: true });
      fs.writeFileSync(path.join(TREE_CACHE_DIR, `${canonicalId}.json`), JSON.stringify(cleaned), 'utf8');
      treeFreshAt.set(canonicalId, Date.now());
    } catch {
      // ignore disk cache write failure
    }
    return cleaned;
  } catch {
    return null;
  }
}

async function fetchDirectTbBatches(token: string): Promise<any[] | null> {
  if (!token || token.length <= 20) return null;
  try {
    const r = await fetchWithTimeout(
      `${TB_DIRECT_API}/student-courses`,
      { headers: makeTbDirectHeaders({ Authorization: `Bearer ${token}` }) },
      8500
    );
    if (!r.ok) return null;
    const raw: any = await r.json().catch(() => null);
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.courses)
          ? raw.courses
          : Array.isArray(raw?.batches)
            ? raw.batches
            : [];
    if (list.length === 0) return null;

    const localThumbs = getLocalThumbFileMap();
    return list
      .map((c: any) => {
        const canonicalId = String(c?._id || c?.id || '').replace(/^tb-/i, '').trim();
        if (!canonicalId) return null;
        const cleanTitle = rebrandText(String(c?.title || c?.name || 'Course Batch').trim());
        const classLabel = rebrandText(
          String(c?.classLabel || c?.classId?.name || c?.class?.name || '').trim()
        );
        const rawThumb =
          c?.thumbnail || c?.courseImage || c?.coverImage || c?.bannerUrl || c?.banner || c?.image;
        return {
          id: canonicalId,
          _id: canonicalId,
          sourceId: canonicalId,
          title: cleanTitle,
          thumbnail: normalizeStudyxThumbnail(rawThumb, canonicalId, cleanTitle, classLabel, localThumbs),
          category: c?.category?.name || c?.category || '',
          classLabel,
        };
      })
      .filter(Boolean);
  } catch {
    return null;
  }
}

async function fetchDirectTbCourseTree(courseId: string, token: string): Promise<any[] | null> {
  const canonicalId = courseId.replace(/^tb-/i, '').trim();
  if (!canonicalId || !token || token.length <= 20) return null;
  try {
    const tRes = await fetchWithTimeout(
      `${TB_DIRECT_API}/category/tree-user/${encodeURIComponent(canonicalId)}/v2`,
      { headers: makeTbDirectHeaders({ Authorization: `Bearer ${token}` }) },
      10000
    );
    if (!tRes.ok) return null;
    const json: any = await tRes.json().catch(() => null);
    const arr = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : null;
    if (!arr || arr.length === 0) return null;
    const cleaned = rebrandSafeStrings(arr);
    try {
      fs.mkdirSync(TREE_CACHE_DIR, { recursive: true });
      fs.writeFileSync(path.join(TREE_CACHE_DIR, `${canonicalId}.json`), JSON.stringify(cleaned), 'utf8');
      treeFreshAt.set(`${canonicalId}:auth`, Date.now());
      treeFreshAt.set(canonicalId, Date.now());
    } catch {
      // ignore disk write error
    }
    return cleaned;
  } catch {
    return null;
  }
}

// Direct Target Board + StudyX hybrid batches catalog with local cache resilience
app.get('/batches.json', async (req: Request, res: Response) => {
  const now = Date.now();
  const forceRefresh = req.query.force === '1';
  const hasTbToken = !!(sharedStudentSession?.token && sharedStudentSession.token.length > 20);
  let diskSource = '';
  if (fs.existsSync(BATCHES_CACHE_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(BATCHES_CACHE_FILE, 'utf8'));
      diskSource = String(parsed?.source || '');
    } catch {
      diskSource = '';
    }
  }
  const shouldRefreshLive =
    forceRefresh ||
    now - lastBatchesLiveSyncAt > 45_000 ||
    !fs.existsSync(BATCHES_CACHE_FILE) ||
    (hasTbToken && diskSource !== 'tb_direct');

  if (shouldRefreshLive) {
    lastBatchesLiveSyncAt = now;
    const [tbCourses, sxCourses] = await Promise.all([
      hasTbToken ? fetchDirectTbBatches(sharedStudentSession!.token) : Promise.resolve(null),
      fetchStudyxBatches(),
    ]);

    const mergedMap = new Map<string, any>();
    // Seed from existing cache first so curated metadata never disappears
    if (fs.existsSync(BATCHES_CACHE_FILE)) {
      try {
        const cached = JSON.parse(fs.readFileSync(BATCHES_CACHE_FILE, 'utf8'));
        for (const c of cached?.new || []) {
          const cid = String(c?.id || c?._id || '').trim();
          if (cid) mergedMap.set(cid, c);
        }
      } catch {
        // ignore
      }
    }
    for (const c of sxCourses || []) {
      if (c?.id) mergedMap.set(c.id, { ...(mergedMap.get(c.id) || {}), ...c });
    }
    for (const c of tbCourses || []) {
      if (c?.id) {
        const prev = mergedMap.get(c.id) || {};
        const betterThumb =
          prev.thumbnail && prev.thumbnail.startsWith('/batch_thumbs/')
            ? prev.thumbnail
            : c.thumbnail || prev.thumbnail;
        mergedMap.set(c.id, { ...prev, ...c, thumbnail: betterThumb });
      }
    }

    const mergedList = Array.from(mergedMap.values());
    if (mergedList.length > 0) {
      const nextSource = tbCourses && tbCourses.length > 0 ? 'tb_direct' : 'studyx';
      try {
        fs.mkdirSync(CATALOG_CACHE_DIR, { recursive: true });
        fs.writeFileSync(
          BATCHES_CACHE_FILE,
          JSON.stringify({ source: nextSource, new: mergedList }),
          'utf8'
        );
      } catch {
        // ignore
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ new: rebrandSafeStrings(mergedList) });
    }
  }

  if (fs.existsSync(BATCHES_CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(BATCHES_CACHE_FILE, 'utf8'));
      res.setHeader('Cache-Control', 'no-store');
      return res.json(rebrandSafeStrings({ new: Array.isArray(cached?.new) ? cached.new : [] }));
    } catch {
      // fall through
    }
  }

  return res.json({ new: [] });
});

// Direct Target Board syllabus tree first (when OTP session active), with StudyX & local disk fallback
app.get('/api/v1/category/tree-user/:courseId/v2', async (req: Request, res: Response) => {
  const rawCourseId = String(req.params.courseId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const courseId = rawCourseId.replace(/^tb-/i, '');
  if (!courseId) {
    return res.status(400).json({ success: false, error: 'Invalid courseId' });
  }

  const forceRefresh = req.query.force === '1';
  const tbToken = sharedStudentSession?.token && sharedStudentSession.token.length > 20 ? sharedStudentSession.token : '';
  const freshKey = `${courseId}:${tbToken ? 'auth' : 'anon'}`;
  const cachePath = path.join(TREE_CACHE_DIR, `${courseId}.json`);
  const freshAt = treeFreshAt.get(freshKey) || 0;
  const ttlMs = tbToken ? 45_000 : 120_000;

  if (!forceRefresh && Date.now() - freshAt < ttlMs && fs.existsSync(cachePath)) {
    try {
      const cachedTree = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      return res.json(rebrandSafeStrings(cachedTree));
    } catch {
      // continue to live refresh
    }
  }

  // Primary source when logged in: Direct Target Board official curriculum tree (includes live, latest lectures & PDFs)
  if (tbToken) {
    const tbTree = await fetchDirectTbCourseTree(courseId, tbToken);
    if (tbTree && tbTree.length > 0) {
      return res.json(tbTree);
    }
  }

  // Secondary fallback: StudyX live tree
  const sxTree = await fetchStudyxCourseTree(courseId);
  if (sxTree !== null) {
    treeFreshAt.set(freshKey, Date.now());
    return res.json(sxTree);
  }

  // Tertiary fallback: local cached syllabus tree on disk
  if (fs.existsSync(cachePath)) {
    try {
      const cachedTree = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      return res.json(rebrandSafeStrings(cachedTree));
    } catch {
      // fall through
    }
  }

  return res.status(502).json({ success: false, error: 'Unable to load batch curriculum right now.' });
});

// Vidyapeeth local cache fallback
app.get('/vg/get/folder_contentsv3', async (req: Request, res: Response) => {
  const courseId = String(req.query.course_id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const vgCachePath = courseId ? path.join(VG_CACHE_DIR, `${courseId}.json`) : '';
  if (canTryUpstream()) {
    try {
      const uRes = await fetchWithTimeout(
        `${UPSTREAM_BASE}${req.originalUrl}`,
        { headers: makeUpstreamHeaders(req) },
        4500
      );
      if (uRes.ok) {
        const rawTxt = await uRes.text();
        let parsed: any = JSON.parse(rawTxt);
        if (parsed && parsed._enc === 1) parsed = decryptPayload(parsed);
        const cleaned = rebrandSafeStrings(parsed);
        if (vgCachePath && Array.isArray(cleaned?.data) && cleaned.data.length > 0) {
          try {
            fs.mkdirSync(VG_CACHE_DIR, { recursive: true });
            fs.writeFileSync(vgCachePath, JSON.stringify(cleaned), 'utf8');
          } catch {
            // ignore
          }
        }
        return res.json(cleaned);
      }
    } catch {
      markUpstreamFailed();
    }
  }
  if (vgCachePath && fs.existsSync(vgCachePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(vgCachePath, 'utf8'));
      return res.json(rebrandSafeStrings(data));
    } catch {
      // continue
    }
  }
  return res.json({ data: [] });
});

const FALLBACK_TB_CLASSES: Array<{ id: string; boardIds: string[] }> = [
  { id: '691dc39227195243f5235256', boardIds: ['6963925feefd2beed5d50f7b', '696397e2eefd2beed5d5187d'] },
  { id: '69639890eefd2beed5d5190d', boardIds: ['6963925feefd2beed5d50f7b', '696397e2eefd2beed5d5187d'] },
  { id: '6963989deefd2beed5d51914', boardIds: ['6963925feefd2beed5d50f7b', '696397e2eefd2beed5d5187d'] },
  { id: '696398aceefd2beed5d5191b', boardIds: ['6963925feefd2beed5d50f7b', '696397e2eefd2beed5d5187d'] },
  { id: '696398e1eefd2beed5d51934', boardIds: ['69639838eefd2beed5d51887'] },
  { id: '696398efeefd2beed5d5193b', boardIds: ['69639858eefd2beed5d51904'] },
];

let cachedTbClasses: Array<{ id: string; boardIds: string[] }> = FALLBACK_TB_CLASSES;
let cachedTbClassesAt = 0;
let cachedLiveStreamsResult: any[] = [];
let cachedLiveStreamsAt = 0;
let lastTreesFullSyncAt = 0;
let treesSyncPromise: Promise<void> | null = null;

function getBatchMetadataMaps(): {
  titleMap: Map<string, string>;
  thumbMap: Map<string, string>;
} {
  const titleMap = new Map<string, string>();
  const thumbMap = new Map<string, string>();
  try {
    const thumbDir = path.join(__dirname, 'public', 'batch_thumbs');
    if (fs.existsSync(thumbDir)) {
      for (const f of fs.readdirSync(thumbDir)) {
        const ext = path.extname(f).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          const baseId = path.basename(f, ext);
          thumbMap.set(baseId, `/batch_thumbs/${f}`);
        }
      }
    }
  } catch {
    // ignore
  }
  try {
    if (fs.existsSync(BATCHES_CACHE_FILE)) {
      const batchesMeta = JSON.parse(fs.readFileSync(BATCHES_CACHE_FILE, 'utf8'));
      for (const b of batchesMeta?.new || []) {
        const id = String(b?.id || b?._id || '').trim();
        if (!id) continue;
        if (b.title || b.name) titleMap.set(id, String(b.title || b.name));
        if (b.thumbnail && b.thumbnail !== '/default-thumbnail.png') {
          thumbMap.set(id, String(b.thumbnail));
        } else if (b.bannerUrl) {
          thumbMap.set(id, String(b.bannerUrl));
        }
      }
    }
  } catch {
    // ignore
  }
  return { titleMap, thumbMap };
}

async function syncAllTreesInBackground(force = false): Promise<void> {
  const now = Date.now();
  const minInterval = force ? 15_000 : 2 * 60 * 1000;
  if (now - lastTreesFullSyncAt < minInterval) return;
  if (treesSyncPromise) return treesSyncPromise;

  treesSyncPromise = (async () => {
    lastTreesFullSyncAt = Date.now();
    try {
      fs.mkdirSync(TREE_CACHE_DIR, { recursive: true });
      const tbToken = sharedStudentSession?.token && sharedStudentSession.token.length > 20 ? sharedStudentSession.token : '';
      const [tbBatches, sxBatches] = await Promise.all([
        tbToken ? fetchDirectTbBatches(tbToken) : Promise.resolve(null),
        fetchStudyxBatches(),
      ]);
      const idSet = new Set<string>(Array.from(getBatchMetadataMaps().titleMap.keys()));
      for (const b of tbBatches || []) if (b?.id) idSet.add(String(b.id));
      for (const b of sxBatches || []) if (b?.id) idSet.add(String(b.id));

      const ids = Array.from(idSet);
      const concurrency = 4;
      for (let i = 0; i < ids.length; i += concurrency) {
        await Promise.all(
          ids.slice(i, i + concurrency).map(async (id) => {
            if (tbToken) {
              const direct = await fetchDirectTbCourseTree(id, tbToken);
              if (direct && direct.length > 0) return;
            }
            await fetchStudyxCourseTree(id);
          })
        );
      }
    } catch {
      // keep cached trees
    } finally {
      treesSyncPromise = null;
    }
  })();

  return treesSyncPromise;
}

async function getTargetBoardClassTargets(): Promise<Array<{ id: string; boardIds: string[] }>> {
  if (Date.now() - cachedTbClassesAt < 10 * 60 * 1000 && cachedTbClasses.length > 0) {
    return cachedTbClasses;
  }
  try {
    const clsRes = await fetchWithTimeout(`${TB_DIRECT_API}/classes`, {}, 4500);
    if (clsRes.ok) {
      const clsJson: any = await clsRes.json().catch(() => null);
      if (Array.isArray(clsJson) && clsJson.length > 0) {
        cachedTbClasses = clsJson
          .filter((c: any) => c?._id || c?.id)
          .map((c: any) => ({
            id: String(c._id || c.id),
            boardIds: Array.isArray(c.stateBoards)
              ? c.stateBoards.map((b: any) => String(b._id || b.id)).filter(Boolean)
              : [],
          }));
        cachedTbClassesAt = Date.now();
      }
    }
  } catch {
    // keep cached/fallback classes
  }
  return cachedTbClasses;
}

function resolveStreamThumbnail(s: any, raw?: any, fallbackThumb?: string): string {
  const candidates = [
    s?.bannerUrl,
    s?.banner,
    s?.thumbnail,
    s?.poster,
    s?.image,
    s?.coverImage,
    s?.courseImage,
    s?.courseId?.thumbnail,
    s?.courseId?.courseImage,
    s?.course?.thumbnail,
    s?.course?.courseImage,
    raw?.bannerUrl,
    raw?.banner,
    raw?.thumbnail,
    raw?.poster,
    raw?.image,
    s?.teacher?.profileImage,
    s?.teacher?.image,
    fallbackThumb,
    '/default-thumbnail.png',
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      return c.trim();
    }
  }
  return '/default-thumbnail.png';
}

function collectLiveNodesFromTree(
  nodes: any[],
  courseId: string,
  courseTitle: string,
  batchThumb: string,
  out: any[]
) {
  if (!Array.isArray(nodes)) return;
  const now = Date.now();
  const maxPastMs = 12 * 3600 * 1000;
  const maxFutureMs = 30 * 24 * 3600 * 1000;

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const buckets = [
      ...(Array.isArray(node.streams) ? node.streams : []),
      ...(Array.isArray(node.lessons) ? node.lessons : []),
      ...(Array.isArray(node.contents) ? node.contents : []),
    ];
    for (const raw of buckets) {
      const src =
        raw?.refId && typeof raw.refId === 'object'
          ? raw.refId
          : raw?.source && typeof raw.source === 'object'
            ? raw.source
            : raw;
      if (!src || typeof src !== 'object') continue;
      const stLower = String(src.status || '').toLowerCase();
      const tpUpper = String(src.tpStatus || '').toUpperCase();

      const isLiveNow =
        tpUpper === 'STREAMING' ||
        stLower === 'live' ||
        src.isLive === true ||
        raw.isLive === true;

      const isUpcoming =
        !isLiveNow &&
        stLower !== 'ended' &&
        stLower !== 'error' &&
        tpUpper !== 'COMPLETED' &&
        tpUpper !== 'ERROR' &&
        (stLower === 'scheduled' ||
          stLower === 'upcoming' ||
          stLower === 'created' ||
          tpUpper === 'NOT_STARTED' ||
          tpUpper === 'SCHEDULED');

      const hasPlayableRef = !!(
        src.tpAssetId ||
        src.liveAssetId ||
        src.assetId ||
        src.hlsUrl ||
        src.playbackUrl ||
        src.liveUrl ||
        src.streamUrl ||
        src.m3u8Url ||
        src.youtubeUrl ||
        src.youtubeId ||
        src.embedUrl ||
        src._id ||
        raw._id
      );
      const resolvedHls =
        src.hlsUrl ||
        src.playbackUrl ||
        src.liveUrl ||
        src.streamUrl ||
        src.m3u8Url ||
        src.youtubeUrl ||
        src.embedUrl ||
        (src.youtubeId ? `https://www.youtube.com/watch?v=${src.youtubeId}` : '') ||
        raw.hlsUrl;

      if (isLiveNow && hasPlayableRef) {
        out.push({
          ...src,
          _id: src._id || raw._id || src.id,
          tpAssetId: src.tpAssetId || src.liveAssetId || src.assetId || raw.tpAssetId || raw.assetId,
          hlsUrl: resolvedHls,
          courseId,
          courseTitle,
          bannerUrl: resolveStreamThumbnail(src, raw, batchThumb),
          status: 'LIVE',
          startTime:
            src.startTime ||
            src.scheduledStart ||
            src.scheduledAt ||
            raw.startTime ||
            src.createdAt,
        });
      } else if (isUpcoming) {
        const startIso =
          src.startTime ||
          src.scheduledStart ||
          src.scheduledAt ||
          raw.startTime ||
          raw.scheduledStart ||
          raw.scheduledAt ||
          '';
        const startMs = startIso ? new Date(startIso).getTime() : NaN;
        const inWindow =
          Number.isNaN(startMs) ||
          (startMs >= now - maxPastMs && startMs <= now + maxFutureMs);
        if (inWindow) {
          out.push({
            ...src,
            _id: src._id || raw._id || src.id,
            tpAssetId: src.tpAssetId || src.liveAssetId || src.assetId || raw.tpAssetId || raw.assetId,
            hlsUrl: resolvedHls,
            courseId,
            courseTitle,
            bannerUrl: resolveStreamThumbnail(src, raw, batchThumb),
            status: 'UPCOMING',
            startTime: startIso,
          });
        }
      }
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      collectLiveNodesFromTree(node.children, courseId, courseTitle, batchThumb, out);
    }
  }
}

// Active live streams: merges Direct Target Board multi-class live/upcoming + Tree streams + Upstream live streams
app.get('/api/v1/tb/active-live-streams', async (req: Request, res: Response) => {
  const forceRefresh = req.query.force === '1';
  if (!forceRefresh && Date.now() - cachedLiveStreamsAt < 20_000 && cachedLiveStreamsResult.length > 0) {
    return res.json({ success: true, activeStreams: cachedLiveStreamsResult });
  }

  // Trigger throttled tree refresh: await briefly when forced, otherwise keep stale-while-revalidate snappy
  if (forceRefresh) {
    await Promise.race([
      syncAllTreesInBackground(true),
      new Promise<void>((resolve) => setTimeout(resolve, 4500)),
    ]);
  } else {
    void syncAllTreesInBackground(false);
  }

  const { titleMap, thumbMap } = getBatchMetadataMaps();
  const merged = new Map<string, any>();

  const addStreams = (items: any[], defaultStatus = 'LIVE') => {
    for (const s of items) {
      if (!s || typeof s !== 'object') continue;
      const key = String(s._id || s.id || s.streamId || s.tpAssetId || s.assetId || s.title || merged.size);
      const stLower = String(s.status || '').toLowerCase();
      const tpUpper = String(s.tpStatus || '').toUpperCase();
      const isLiveNow =
        tpUpper === 'STREAMING' ||
        stLower === 'live' ||
        s.isLive === true;
      const isUpcoming =
        !isLiveNow &&
        (stLower === 'scheduled' ||
          stLower === 'upcoming' ||
          stLower === 'created' ||
          tpUpper === 'NOT_STARTED' ||
          tpUpper === 'SCHEDULED' ||
          defaultStatus === 'UPCOMING');

      const cId = String(s.courseId?._id || s.courseId || s.course?._id || s.course || '').trim();
      const cTitle =
        s.courseTitle ||
        s.courseId?.title ||
        s.course?.title ||
        s.subject ||
        s.category?.name ||
        (cId ? titleMap.get(cId) : '') ||
        '';
      const resolvedBanner = resolveStreamThumbnail(s, undefined, cId ? thumbMap.get(cId) : undefined);

      const normalized = {
        ...s,
        tpAssetId: s.tpAssetId || s.liveAssetId || s.assetId || s.video?.assetId,
        hlsUrl:
          s.hlsUrl ||
          s.playbackUrl ||
          s.liveUrl ||
          s.streamUrl ||
          s.m3u8Url ||
          s.youtubeUrl ||
          s.embedUrl ||
          (s.youtubeId ? `https://www.youtube.com/watch?v=${s.youtubeId}` : ''),
        courseId: cId || s.courseId,
        courseIds: cId ? [cId] : [],
        courseTitle: cTitle || s.courseTitle,
        bannerUrl: resolvedBanner,
        status: isLiveNow ? 'LIVE' : isUpcoming ? 'UPCOMING' : defaultStatus,
        startTime: s.startTime || s.scheduledStart || s.scheduledAt || s.scheduledTime || s.createdAt,
      };

      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, normalized);
      } else {
        const mergedCourseIds = Array.from(
          new Set([...(prev.courseIds || []), ...(normalized.courseIds || [])].filter(Boolean))
        );
        const betterBanner =
          prev.bannerUrl && prev.bannerUrl !== '/default-thumbnail.png'
            ? prev.bannerUrl
            : normalized.bannerUrl;
        const nextObj =
          normalized.status === 'LIVE' && prev.status !== 'LIVE'
            ? { ...prev, ...normalized }
            : { ...normalized, ...prev };
        merged.set(key, {
          ...nextObj,
          tpAssetId: nextObj.tpAssetId || normalized.tpAssetId || prev.tpAssetId,
          hlsUrl: nextObj.hlsUrl || normalized.hlsUrl || prev.hlsUrl,
          bannerUrl: betterBanner || normalized.bannerUrl || prev.bannerUrl,
          courseTitle: prev.courseTitle || normalized.courseTitle,
          courseIds: mergedCourseIds,
        });
      }
    }
  };

  if (sharedStudentSession?.token) {
    try {
      const headers = makeTbDirectHeaders({ Authorization: `Bearer ${sharedStudentSession.token}` });
      const classTargets = await getTargetBoardClassTargets();
      const queries: Array<{ url: string; kind: string }> = [
        { url: `${TB_DIRECT_API}/user/streams?type=live`, kind: 'LIVE' },
        { url: `${TB_DIRECT_API}/user/streams?type=upcoming`, kind: 'UPCOMING' },
      ];
      for (const cls of classTargets) {
        queries.push({
          url: `${TB_DIRECT_API}/user/streams?classId=${encodeURIComponent(cls.id)}&type=live`,
          kind: 'LIVE',
        });
        queries.push({
          url: `${TB_DIRECT_API}/user/streams?classId=${encodeURIComponent(cls.id)}&type=upcoming`,
          kind: 'UPCOMING',
        });
        for (const boardId of cls.boardIds) {
          const qBase = `classId=${encodeURIComponent(cls.id)}&stateBoardId=${encodeURIComponent(boardId)}`;
          queries.push({ url: `${TB_DIRECT_API}/user/streams?${qBase}&type=live`, kind: 'LIVE' });
          queries.push({ url: `${TB_DIRECT_API}/user/streams?${qBase}&type=upcoming`, kind: 'UPCOMING' });
        }
      }

      const results = await Promise.all(
        queries.map(async (q) => {
          try {
            const tbRes = await fetchWithTimeout(q.url, { headers }, 4500);
            if (!tbRes.ok) return { list: [], kind: q.kind };
            const json: any = await tbRes.json().catch(() => null);
            const list = Array.isArray(json)
              ? json
              : Array.isArray(json?.streams)
                ? json.streams
                : Array.isArray(json?.data)
                  ? json.data
                  : Array.isArray(json?.activeStreams)
                    ? json.activeStreams
                    : [];
            return { list, kind: q.kind };
          } catch {
            return { list: [], kind: q.kind };
          }
        })
      );

      for (const r of results) {
        addStreams(r.list, r.kind);
      }
    } catch {
      // ignore direct fetch failure
    }
  }

  // Scan course trees for active STREAMING & upcoming SCHEDULED classes across all batches
  try {
    if (fs.existsSync(TREE_CACHE_DIR)) {
      const treeFiles = fs.readdirSync(TREE_CACHE_DIR).filter((f) => f.endsWith('.json'));
      const treeLiveItems: any[] = [];
      for (const file of treeFiles) {
        const cId = file.replace('.json', '');
        const rawTree = JSON.parse(fs.readFileSync(path.join(TREE_CACHE_DIR, file), 'utf8'));
        collectLiveNodesFromTree(
          rawTree,
          cId,
          titleMap.get(cId) || '',
          thumbMap.get(cId) || '/default-thumbnail.png',
          treeLiveItems
        );
      }
      addStreams(treeLiveItems, 'UPCOMING');
    }
  } catch {
    // ignore tree scan error
  }

  if (canTryUpstream()) {
    try {
      const uRes = await fetchWithTimeout(
        `${UPSTREAM_BASE}/api/v1/tb/active-live-streams`,
        { headers: makeUpstreamHeaders(req) },
        3500
      );
      if (uRes.ok) {
        const txt = await uRes.text();
        let parsed: any = JSON.parse(txt);
        if (parsed && parsed._enc === 1) parsed = decryptPayload(parsed);
        addStreams(Array.isArray(parsed?.activeStreams) ? parsed.activeStreams : [], 'LIVE');
      } else if (uRes.status >= 500 || uRes.status === 403 || uRes.status === 429) {
        markUpstreamFailed();
      }
    } catch {
      markUpstreamFailed();
    }
  }

  const sortedList = Array.from(merged.values()).sort((a, b) => {
    const aLive = a.status === 'LIVE' ? 0 : 1;
    const bLive = b.status === 'LIVE' ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    const aTime = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
    return aLive === 0 ? bTime - aTime : aTime - bTime;
  });

  const finalList = rebrandSafeStrings(sortedList);
  cachedLiveStreamsResult = finalList;
  cachedLiveStreamsAt = Date.now();
  return res.json({ success: true, activeStreams: finalList });
});

// Branded GB STUDY SVG poster generator for batches without external image posters
app.get('/api/v1/gb-poster', (req: Request, res: Response) => {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const titleRaw = rebrandText(String(req.query.t || 'GB STUDY Batch').trim()).slice(0, 72);
  const classRaw = rebrandText(String(req.query.c || '2026-27').trim()).slice(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#312e81"/>
      <stop offset="55%" stop-color="#5a4bda"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#g)"/>
  <circle cx="710" cy="70" r="120" fill="#ffffff" opacity="0.07"/>
  <circle cx="90" cy="390" r="140" fill="#000000" opacity="0.14"/>
  <rect x="44" y="38" width="144" height="40" rx="20" fill="#ffd600"/>
  <text x="116" y="64" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="800" fill="#111827">GB STUDY</text>
  <rect x="202" y="38" width="150" height="40" rx="20" fill="#000000" opacity="0.28"/>
  <text x="277" y="64" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="#ffffff">${esc(classRaw)}</text>
  <foreignObject x="44" y="116" width="712" height="220">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: system-ui, -apple-system, sans-serif; color: #ffffff; font-size: 36px; font-weight: 800; line-height: 1.25; display: flex; align-items: center; height: 220px;">
      ${esc(titleRaw)}
    </div>
  </foreignObject>
  <rect x="0" y="378" width="800" height="72" fill="#000000" opacity="0.28"/>
  <text x="44" y="422" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="#ffd600">ALL LECTURES &amp; PDF NOTES UNLOCKED</text>
</svg>`;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.send(svg);
});

// Safe proxy for StudyX / Target Board / DigitalOcean batch & class images
app.get('/api/v1/tb-image', async (req: Request, res: Response) => {
  const rawParam = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  const rawUrl = rawParam.startsWith('/') ? `${STUDYX_BASE}${rawParam}` : rawParam;
  if (rawUrl && isSafeExternalUrl(rawUrl)) {
    try {
      const imgHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://targetboard.co.in/',
      };
      try {
        if (new URL(rawUrl).hostname === 'seashell-app-3z5jp.ondigitalocean.app' && sharedStudentSession?.token) {
          imgHeaders.Authorization = `Bearer ${sharedStudentSession.token}`;
        }
      } catch {
        // ignore
      }
      const imgRes = await fetchWithTimeout(rawUrl, { headers: imgHeaders }, 10000);
      const ct = (imgRes.headers.get('content-type') || '').toLowerCase();
      if (imgRes.ok && ct.startsWith('image/')) {
        res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(Buffer.from(await imgRes.arrayBuffer()));
      }
    } catch {
      // fall through
    }
  }
  const fallbackThumb = path.join(__dirname, 'public', 'default-thumbnail.png');
  if (fs.existsSync(fallbackThumb)) {
    return res.sendFile(fallbackThumb);
  }
  return res.status(404).end();
});

// Stream/lecture banner image handler with graceful local fallback
app.get('/api/v1/secure/img/*', async (req: Request, res: Response) => {
  if (canTryUpstream()) {
    try {
      const uRes = await fetchWithTimeout(
        `${UPSTREAM_BASE}${req.originalUrl}`,
        { headers: makeUpstreamHeaders(req) },
        2500
      );
      const ct = (uRes.headers.get('content-type') || '').toLowerCase();
      if (uRes.ok && ct.startsWith('image/')) {
        res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(Buffer.from(await uRes.arrayBuffer()));
      }
    } catch {
      markUpstreamFailed();
    }
  }
  const fallbackThumb = path.join(__dirname, 'public', 'default-thumbnail.png');
  if (fs.existsSync(fallbackThumb)) {
    return res.sendFile(fallbackThumb);
  }
  return res.status(404).end();
});

// Direct safe PDF streaming proxy (supports DigitalOcean Spaces, Target Board & StudyX paths)
app.get('/api/v1/pdf-proxy', async (req: Request, res: Response) => {
  const rawParam = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  const rawUrl = rawParam.startsWith('/') ? `${STUDYX_BASE}${rawParam}` : rawParam;
  if (!rawUrl || !isSafeExternalUrl(rawUrl)) {
    return res.status(400).json({ success: false, error: 'Invalid PDF URL' });
  }
  try {
    const pdfHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/pdf,*/*',
      Referer: 'https://targetboard.co.in/',
    };
    try {
      if (new URL(rawUrl).hostname === 'seashell-app-3z5jp.ondigitalocean.app' && sharedStudentSession?.token) {
        pdfHeaders.Authorization = `Bearer ${sharedStudentSession.token}`;
      }
    } catch {
      // ignore
    }
    const pdfRes = await fetchWithTimeout(rawUrl, { headers: pdfHeaders }, 25000);
    if (!pdfRes.ok) {
      return res.status(pdfRes.status).json({ success: false, error: 'PDF unavailable' });
    }
    res.setHeader('Content-Type', pdfRes.headers.get('content-type') || 'application/pdf');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const buf = Buffer.from(await pdfRes.arrayBuffer());
    return res.send(buf);
  } catch {
    return res.status(502).json({ success: false, error: 'Failed to load PDF document' });
  }
});

// Proxy TPStreams API / Widevine license calls directly to app.tpstreams.com (100% independent of old website)
app.all('/api/v1/kuepke/*', async (req: Request, res: Response) => {
  const targetUrl = `${TPSTREAMS_BASE}${req.originalUrl}`;
  const method = req.method.toUpperCase();
  const headers: Record<string, string> = {
    Origin: TPSTREAMS_BASE,
    Referer: `${TPSTREAMS_BASE}/`,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
  for (const k of ['content-type', 'accept', 'x-csrftoken', 'x-requested-with']) {
    const v = req.headers[k];
    if (typeof v === 'string' && v) headers[k] = v;
  }
  const init: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    const rawBuf = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === 'string'
        ? Buffer.from(req.body)
        : undefined;
    if (rawBuf && rawBuf.length > 0) init.body = new Uint8Array(rawBuf);
  }
  try {
    const tpRes = await fetchWithTimeout(targetUrl, init, 12000);
    res.status(tpRes.status);
    for (const h of SAFE_RESPONSE_HEADERS) {
      const v = tpRes.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    const buf = Buffer.from(await tpRes.arrayBuffer());
    return res.send(buf);
  } catch {
    return res.status(502).json({ success: false, error: 'DRM/stream key request failed' });
  }
});

function findStreamAssetInTreeArray(
  rawTree: any[],
  streamId: string,
  lectureTitle = ''
): { assetId: string; hlsUrl: string } | null {
  if (!Array.isArray(rawTree)) return null;
  const stack = [...rawTree];
  const normTitle = lectureTitle.trim().toLowerCase();
  let titleFallback: { assetId: string; hlsUrl: string } | null = null;

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    const buckets = [
      ...(Array.isArray(node.lessons) ? node.lessons : []),
      ...(Array.isArray(node.streams) ? node.streams : []),
      ...(Array.isArray(node.contents) ? node.contents : []),
    ];
    for (const item of buckets) {
      const src =
        item?.refId && typeof item.refId === 'object'
          ? item.refId
          : item?.source && typeof item.source === 'object'
            ? item.source
            : item;
      const itemIds = [item?._id, item?.id, src?._id, src?.id].filter(Boolean).map(String);
      const foundAsset = String(
        src?.tpAssetId ||
          src?.liveAssetId ||
          src?.video?.assetId ||
          src?.assetId ||
          item?.tpAssetId ||
          item?.liveAssetId ||
          item?.assetId ||
          ''
      ).trim();
      const rawYtId = String(src?.youtubeId || item?.youtubeId || '').trim();
      const foundHls = String(
        src?.hlsUrl ||
          item?.hlsUrl ||
          src?.playbackUrl ||
          item?.playbackUrl ||
          src?.liveUrl ||
          item?.liveUrl ||
          src?.streamUrl ||
          item?.streamUrl ||
          src?.m3u8Url ||
          item?.m3u8Url ||
          src?.videoUrl ||
          src?.video?.url ||
          src?.youtubeUrl ||
          item?.youtubeUrl ||
          src?.embedUrl ||
          item?.embedUrl ||
          (rawYtId ? `https://www.youtube.com/watch?v=${rawYtId}` : '') ||
          ''
      ).trim();
      const hasRawAsset = !!foundAsset && !foundAsset.startsWith('vid_');
      const hasDirectHls = !!foundHls && foundHls.startsWith('http');

      if (streamId && itemIds.includes(streamId) && (hasRawAsset || hasDirectHls || foundAsset || foundHls)) {
        return { assetId: foundAsset, hlsUrl: foundHls };
      }

      if (
        !titleFallback &&
        normTitle &&
        (hasRawAsset || hasDirectHls) &&
        String(src?.title || item?.title || '').trim().toLowerCase() === normTitle
      ) {
        titleFallback = { assetId: foundAsset, hlsUrl: foundHls };
      }
    }
    if (Array.isArray(node.children)) {
      stack.push(...node.children);
    }
  }
  return titleFallback;
}

function findStreamAssetInCachedTrees(
  streamId: string,
  courseId = '',
  lectureTitle = ''
): { assetId: string; hlsUrl: string } | null {
  if ((!streamId && !lectureTitle) || !fs.existsSync(TREE_CACHE_DIR)) return null;
  try {
    const preferred = courseId ? [`${courseId}.json`] : [];
    const others = fs
      .readdirSync(TREE_CACHE_DIR)
      .filter((f) => f.endsWith('.json') && !preferred.includes(f));
    for (const file of [...preferred, ...others]) {
      const p = path.join(TREE_CACHE_DIR, file);
      if (!fs.existsSync(p)) continue;
      const rawTree = JSON.parse(fs.readFileSync(p, 'utf8'));
      const hit = findStreamAssetInTreeArray(rawTree, streamId, lectureTitle);
      if (hit && ((hit.assetId && !hit.assetId.startsWith('vid_')) || hit.hlsUrl.startsWith('http'))) {
        return hit;
      }
    }
  } catch {
    // ignore tree lookup failure
  }
  return null;
}

// Stream ticket creation: Direct Target Board (/streams/:id, /category/tree-user, /tpstreams/token) -> StudyX -> Direct HLS / YouTube / Embed
app.post('/api/v1/tb/create-stream-ticket', async (req: Request, res: Response) => {
  const { payload, wasEncrypted } = parseRawJsonBody(req);
  let assetId = String(payload?.assetId || '').trim();
  const streamId = String(payload?.streamId || '').trim();
  const courseId = String(payload?.courseId || '').replace(/^tb-/i, '').trim();
  const lectureTitle = String(payload?.title || '').trim();
  let hlsUrl = String(payload?.hlsUrl || '').trim();
  const isLive = !!payload?.isLive;
  const rawToken = typeof payload?.token === 'string' ? payload.token.trim() : '';
  const effectiveToken =
    rawToken && !rawToken.startsWith('tb_user_token_') && rawToken.length > 20
      ? rawToken
      : sharedStudentSession?.token || '';

  let tbAccessDenied = false;

  // Step 0a: Direct Target Board /streams/:streamId lookup (crucial for LIVE & UPCOMING streams!)
  if (
    streamId &&
    effectiveToken &&
    (isLive || !assetId || assetId.startsWith('vid_') || !hlsUrl || hlsUrl.startsWith('/api/v1/secure/'))
  ) {
    try {
      const stRes = await fetchWithTimeout(
        `${TB_DIRECT_API}/streams/${encodeURIComponent(streamId)}`,
        { headers: makeTbDirectHeaders({ Authorization: `Bearer ${effectiveToken}` }) },
        6500
      );
      if (stRes.status === 401 || stRes.status === 403) {
        tbAccessDenied = true;
      } else if (stRes.ok) {
        const stJson: any = await stRes.json().catch(() => null);
        const stObj = stJson?.stream || stJson?.data || stJson;
        const stAsset = String(
          stObj?.tpAssetId || stObj?.liveAssetId || stObj?.video?.assetId || stObj?.assetId || ''
        ).trim();
        if (stAsset && !stAsset.startsWith('vid_')) assetId = stAsset;
        const stYtId = String(stObj?.youtubeId || '').trim();
        const stUrl = String(
          stObj?.hlsUrl ||
            stObj?.playbackUrl ||
            stObj?.liveUrl ||
            stObj?.streamUrl ||
            stObj?.m3u8Url ||
            stObj?.videoUrl ||
            stObj?.youtubeUrl ||
            stObj?.embedUrl ||
            (stYtId ? `https://www.youtube.com/watch?v=${stYtId}` : '') ||
            ''
        ).trim();
        if (stUrl && stUrl.startsWith('http')) hlsUrl = stUrl;
      }
    } catch {
      // continue to tree lookup
    }
  }

  // Step 0b: Recover unencrypted assetId/hlsUrl from Direct Target Board tree, cached trees, or StudyX tree
  if ((!assetId || assetId.startsWith('vid_') || !hlsUrl || hlsUrl.startsWith('/api/v1/secure/')) && (streamId || lectureTitle)) {
    const recovered = findStreamAssetInCachedTrees(streamId, courseId, lectureTitle);
    if (recovered) {
      if (recovered.assetId && !recovered.assetId.startsWith('vid_')) assetId = recovered.assetId;
      if (recovered.hlsUrl && recovered.hlsUrl.startsWith('http')) hlsUrl = recovered.hlsUrl;
    }
    if ((!assetId || assetId.startsWith('vid_') || !hlsUrl.startsWith('http')) && courseId && effectiveToken) {
      const tbTree = await fetchDirectTbCourseTree(courseId, effectiveToken);
      if (tbTree) {
        const hit = findStreamAssetInTreeArray(tbTree, streamId, lectureTitle);
        if (hit) {
          if (hit.assetId && !hit.assetId.startsWith('vid_')) assetId = hit.assetId;
          if (hit.hlsUrl && hit.hlsUrl.startsWith('http')) hlsUrl = hit.hlsUrl;
        }
      }
    }
    if ((!assetId || assetId.startsWith('vid_')) && courseId) {
      const freshTree = await fetchStudyxCourseTree(courseId);
      if (freshTree) {
        const hit = findStreamAssetInTreeArray(freshTree, streamId, lectureTitle);
        if (hit) {
          if (hit.assetId && !hit.assetId.startsWith('vid_')) assetId = hit.assetId;
          if (hit.hlsUrl && hit.hlsUrl.startsWith('http')) hlsUrl = hit.hlsUrl;
        }
      }
    }
  }

  // Priority 1: Direct Target Board -> TPStreams token (live & recorded TPStreams assets)
  if (assetId && !assetId.startsWith('vid_') && effectiveToken) {
    try {
      const tkRes = await fetchWithTimeout(
        `${TB_DIRECT_API}/tpstreams/token/${encodeURIComponent(assetId)}`,
        {
          method: 'POST',
          headers: makeTbDirectHeaders({ Authorization: `Bearer ${effectiveToken}` }),
          body: JSON.stringify({}),
        },
        9000
      );
      if (tkRes.status === 401 || tkRes.status === 403) {
        tbAccessDenied = true;
        // Keep sharedStudentSession & permanentLockedMobile intact on disk so the locked first login never resets!
      } else if (tkRes.ok) {
        const tkJson: any = await tkRes.json().catch(() => null);
        const accessToken = tkJson?.code || tkJson?.access_token || tkJson?.data?.code;
        const tkHls = String(
          tkJson?.hlsUrl || tkJson?.playbackUrl || tkJson?.playback_url || tkJson?.data?.hlsUrl || ''
        ).trim();
        if (typeof accessToken === 'string' && accessToken.length > 0) {
          const ticketId = createLocalTicket({
            kind: 'tpstreams',
            assetId,
            accessToken,
            isLive,
          });
          return sendAuthResponse(
            req,
            res,
            200,
            { success: true, watchUrl: `/api/v1/stream/watch/${ticketId}` },
            wasEncrypted
          );
        }
        if (tkHls && isSafeExternalUrl(tkHls)) {
          const ticketId = createLocalTicket({ kind: 'hls', hlsUrl: tkHls, isLive });
          return sendAuthResponse(
            req,
            res,
            200,
            { success: true, watchUrl: `/api/v1/stream/watch/${ticketId}` },
            wasEncrypted
          );
        }
      }
    } catch {
      // fall through
    }
  }

  // Priority 2: Direct YouTube Live URL/ID when Target Board live uses YouTube
  const ytId = hlsUrl ? extractYoutubeVideoId(hlsUrl) : '';
  if (ytId) {
    const ticketId = createLocalTicket({ kind: 'youtube', youtubeUrl: hlsUrl, isLive });
    return sendAuthResponse(
      req,
      res,
      200,
      { success: true, watchUrl: `/api/v1/stream/watch/${ticketId}` },
      wasEncrypted
    );
  }

  // Priority 3: Direct external HTTPS HLS URL for live/recorded streams
  if (hlsUrl && isSafeExternalUrl(hlsUrl) && hlsUrl.includes('.m3u8')) {
    const ticketId = createLocalTicket({
      kind: 'hls',
      hlsUrl,
      isLive,
    });
    return sendAuthResponse(
      req,
      res,
      200,
      { success: true, watchUrl: `/api/v1/stream/watch/${ticketId}` },
      wasEncrypted
    );
  }

  // Priority 4: StudyX video resolution endpoint (/api/tb/video/<assetId>)
  if (assetId && !assetId.startsWith('vid_')) {
    try {
      const sxRes = await fetchWithTimeout(
        `${STUDYX_BASE}/api/tb/video/${encodeURIComponent(assetId)}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
        },
        8000
      );
      if (sxRes.ok) {
        const sxJson: any = await sxRes.json().catch(() => null);
        const sxHls = String(sxJson?.hlsUrl || '').trim();
        if (sxHls && isSafeExternalUrl(sxHls)) {
          const ticketId = createLocalTicket({ kind: 'hls', hlsUrl: sxHls, isLive });
          return sendAuthResponse(
            req,
            res,
            200,
            { success: true, watchUrl: `/api/v1/stream/watch/${ticketId}` },
            wasEncrypted
          );
        }
        const sxEmbed = String(sxJson?.embedUrl || '').trim();
        if (sxEmbed && isSafeExternalUrl(sxEmbed)) {
          const embUrl = sxEmbed.replace('autoplay=0', 'autoplay=1');
          const embRes = await fetchWithTimeout(
            embUrl,
            {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Origin: 'https://targetboard.co.in',
                Referer: 'https://targetboard.co.in/',
              },
            },
            7000
          );
          if (embRes.ok) {
            let html = await embRes.text();
            if (!html.includes('<title>Not Found</title>') && !html.includes('<h1>Not Found</h1>')) {
              html = stripLegacyPlayerOverlay(rebrandText(html));
              const addon = buildGbStudyAddonHtml();
              html = html.includes('</body>') ? html.replace('</body>', `${addon}</body>`) : `${html}${addon}`;
              const ticketId = createLocalTicket({ kind: 'html', html, isLive });
              return sendAuthResponse(
                req,
                res,
                200,
                { success: true, watchUrl: `/api/v1/stream/watch/${ticketId}` },
                wasEncrypted
              );
            }
          }
        }
      }
    } catch {
      // fall through
    }
  }

  // Priority 5: Any remaining direct external HTTPS HLS or Embed URL
  if (hlsUrl && isSafeExternalUrl(hlsUrl)) {
    const looksEmbed = hlsUrl.includes('/embed') || hlsUrl.includes('tpstreams.com/embed');
    const ticketId = createLocalTicket(
      looksEmbed
        ? { kind: 'embed', embedUrl: hlsUrl, isLive }
        : { kind: 'hls', hlsUrl, isLive }
    );
    return sendAuthResponse(
      req,
      res,
      200,
      { success: true, watchUrl: `/api/v1/stream/watch/${ticketId}` },
      wasEncrypted
    );
  }

  // Priority 6: Clean OTP activation trigger whenever Target Board token is missing or expired (401)
  return sendAuthResponse(
    req,
    res,
    200,
    {
      success: false,
      needsAuth: true,
      error: tbAccessDenied
        ? 'पिछला सेशन समाप्त हो गया है। लेक्चर चलाने के लिए कृपया 1 बार OTP से पुनः सक्रिय करें।'
        : 'वीडियो/लाइव क्लास चलाने के लिए एक बार मोबाइल OTP से सक्रिय करें।',
    },
    wasEncrypted
  );
});

// Watch endpoint: serves local TPStreams/HLS/YouTube/Embed/cached-HTML tickets directly
app.get('/api/v1/stream/watch/:ticket', async (req: Request, res: Response) => {
  const ticket = String(req.params.ticket || '');
  const localMeta = localStreamTickets.get(ticket);

  if (localMeta) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    if (localMeta.kind === 'html' && localMeta.html) {
      return res.send(localMeta.html);
    }

    if (localMeta.kind === 'youtube' && localMeta.youtubeUrl) {
      return res.send(renderLocalYoutubePlayerHtml(localMeta.youtubeUrl, localMeta.isLive));
    }

    if (localMeta.kind === 'embed' && localMeta.embedUrl) {
      return res.send(renderLocalEmbedPlayerHtml(localMeta.embedUrl));
    }

    if (localMeta.kind === 'hls' && localMeta.hlsUrl) {
      return res.send(renderLocalHlsPlayerHtml(localMeta.hlsUrl, localMeta.isLive));
    }

    if (localMeta.kind === 'tpstreams' && localMeta.assetId && localMeta.accessToken) {
      const embedUrl = `${TPSTREAMS_BASE}/embed/${TPSTREAMS_ORG}/${encodeURIComponent(
        localMeta.assetId
      )}/?access_token=${encodeURIComponent(localMeta.accessToken)}&autoplay=1`;
      try {
        const tpRes = await fetchWithTimeout(
          embedUrl,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Referer: 'https://targetboard.co.in/',
              Origin: 'https://targetboard.co.in',
            },
          },
          10000
        );
        if (tpRes.ok) {
          let html = await tpRes.text();
          html = stripLegacyPlayerOverlay(rebrandText(html));
          const liveFlagScript = `<script>window.__gbIsLive = ${localMeta.isLive ? 'true' : 'false'};</script>`;
          const addon = `${liveFlagScript}${buildGbStudyAddonHtml()}`;
          if (html.includes('</body>')) {
            html = html.replace('</body>', `${addon}</body>`);
          } else {
            html += addon;
          }
          return res.send(html);
        }
      } catch {
        // fall through to error
      }
      return res.status(502).send(
        '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;">Unable to start TPStreams player. Please retry.</div>'
      );
    }
  }

  return res.status(410).send(
    '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;">Session ticket expired. Please close and click Retry.</div>'
  );
});

// Remaining /api/* and /vg/* proxy fallback (only used if upstream has dynamic encrypted doc/video routes)
app.all('/api/*', (req, res) => proxyToUpstream(req, res, 12000));
app.all('/vg/*', (req, res) => proxyToUpstream(req, res, 8000));

// Local batch thumbnails -> graceful fallback to /default-thumbnail.png (never breaks if old site is down)
app.get('/batch_thumbs/:file', async (req: Request, res: Response, next) => {
  const localPath = path.join(__dirname, 'public', 'batch_thumbs', req.params.file);
  if (fs.existsSync(localPath)) {
    return next();
  }
  try {
    const uRes = await fetchWithTimeout(
      `${UPSTREAM_BASE}${req.originalUrl}`,
      { headers: makeUpstreamHeaders(req) },
      3500
    );
    const ct = (uRes.headers.get('content-type') || '').toLowerCase();
    if (uRes.ok && ct.startsWith('image/')) {
      res.setHeader('Content-Type', ct);
      return res.send(Buffer.from(await uRes.arrayBuffer()));
    }
  } catch {
    // ignore upstream failure
  }
  const fallbackThumb = path.join(__dirname, 'public', 'default-thumbnail.png');
  if (fs.existsSync(fallbackThumb)) {
    return res.sendFile(fallbackThumb);
  }
  return res.status(404).end();
});

// Serve verified Cloudflare Pages Direct Upload ZIP cleanly for download
app.get(['/gbstudytb-cloudflare.zip', '/gbstudykhangs-cloudflare.zip'], (req: Request, res: Response) => {
  const zipPath = path.join(SHARED_SESSION_DIR, 'gbstudytb-cloudflare.zip');
  if (!fs.existsSync(zipPath)) {
    return res.status(404).send('Deployment ZIP package not generated yet.');
  }
  const stat = fs.statSync(zipPath);
  const outName = req.path.includes('khangs') ? 'gbstudykhangs-cloudflare.zip' : 'gbstudytb-cloudflare.zip';
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Cache-Control', 'no-store');
  return fs.createReadStream(zipPath).pipe(res);
});

async function startServer() {
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GB STUDY Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
