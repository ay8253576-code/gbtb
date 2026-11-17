import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CF_DIST = path.join(ROOT, '.cf_dist');
const STATIC_DATA_DIR = path.join(CF_DIST, 'static_data');
const OUTPUT_ZIP = path.join(ROOT, 'data', 'gbstudytb-cloudflare.zip');

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest, excludeSubdirs = []) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (excludeSubdirs.includes(entry)) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry), []);
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

const STATIC_TREES_DIR = path.join(STATIC_DATA_DIR, 'trees');

function compactTreeNode(node) {
  if (!node || typeof node !== 'object') return null;
  const out = { _id: node._id, name: node.name || node.title || '' };
  const seen = new Set();
  const lessons = [];
  const contents = [];
  const buckets = [
    ...(Array.isArray(node.lessons) ? node.lessons : []),
    ...(Array.isArray(node.streams) ? node.streams : []),
    ...(Array.isArray(node.contents) ? node.contents : []),
  ];
  for (const rawItem of buckets) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const src =
      rawItem.refId && typeof rawItem.refId === 'object'
        ? rawItem.refId
        : rawItem.source && typeof rawItem.source === 'object'
          ? rawItem.source
          : rawItem;
    const id = String(src._id || src.id || rawItem._id || rawItem.id || '');
    const pdfUrl = src.pdf?.url || src.pdfUrl || rawItem.pdf?.url || rawItem.pdfUrl || '';
    const tpAssetId =
      src.tpAssetId || src.video?.assetId || src.assetId || rawItem.tpAssetId || rawItem.assetId || '';
    const hlsUrl = src.hlsUrl || rawItem.hlsUrl || src.video?.url || '';
    const isPdf = src.type === 'pdf' || rawItem.type === 'pdf' || (!!pdfUrl && !tpAssetId && !hlsUrl);
    const dedupeKey =
      (isPdf ? 'p:' : 'v:') + (id || pdfUrl || tpAssetId || hlsUrl || src.title || rawItem.title || '');
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const slim = { _id: id, title: String(src.title || rawItem.title || '').trim() };
    const desc = src.description || rawItem.description;
    if (desc) slim.description = desc;
    const cAt = src.startTime || src.scheduledAt || src.createdAt || rawItem.createdAt;
    if (cAt) slim.createdAt = cAt;
    if (isPdf && pdfUrl) {
      slim.type = 'pdf';
      slim.pdf = { url: pdfUrl };
      const fn = src.pdf?.fileName || rawItem.pdf?.fileName;
      if (fn && fn !== `${slim.title}.pdf`) slim.pdf.fileName = fn;
      contents.push(slim);
    } else if (tpAssetId || hlsUrl || src.type === 'video' || src.type === 'stream' || rawItem.type === 'stream') {
      slim.type = src.type === 'stream' || rawItem.type === 'stream' ? 'stream' : 'video';
      if (tpAssetId) slim.tpAssetId = tpAssetId;
      if (hlsUrl) slim.hlsUrl = hlsUrl;
      const st = src.status || rawItem.status;
      if (st && st !== 'ended') slim.status = st;
      const tps = src.tpStatus || rawItem.tpStatus;
      if (tps && tps !== 'COMPLETED') slim.tpStatus = tps;
      const thumb = src.bannerUrl || src.thumbnail || rawItem.bannerUrl || rawItem.thumbnail;
      if (thumb && !thumb.startsWith('/api/v1/secure/img/')) slim.thumbnail = thumb;
      lessons.push(slim);
    }
  }
  if (lessons.length) out.lessons = lessons;
  if (contents.length) out.contents = contents;
  if (Array.isArray(node.children) && node.children.length) {
    out.children = node.children.map(compactTreeNode).filter(Boolean);
  }
  return out;
}

function buildLiveCandidatesIndex() {
  const treesDir = path.join(ROOT, 'catalog_cache', 'trees');
  const batchesFile = path.join(ROOT, 'catalog_cache', 'batches.json');
  const liveCandidates = [];
  const seenIds = new Set();
  const titleMap = new Map();
  const thumbMap = new Map();

  if (fs.existsSync(batchesFile)) {
    const bJson = JSON.parse(fs.readFileSync(batchesFile, 'utf8'));
    for (const b of bJson.new || []) {
      const id = String(b.id || b._id || '');
      if (!id) continue;
      titleMap.set(id, String(b.title || b.name || ''));
      thumbMap.set(id, String(b.thumbnail || b.bannerUrl || '/default-thumbnail.png'));
    }
  }

  fs.mkdirSync(STATIC_TREES_DIR, { recursive: true });

  if (fs.existsSync(treesDir)) {
    for (const file of fs.readdirSync(treesDir)) {
      if (!file.endsWith('.json')) continue;
      const courseId = file.replace('.json', '');
      const rawTree = JSON.parse(fs.readFileSync(path.join(treesDir, file), 'utf8'));
      const compacted = Array.isArray(rawTree) ? rawTree.map(compactTreeNode).filter(Boolean) : [];
      fs.writeFileSync(path.join(STATIC_TREES_DIR, file), JSON.stringify(compacted));

      const stack = Array.isArray(rawTree) ? [...rawTree] : [];
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
          const itemId = String(src?._id || src?.id || item?._id || item?.id || '');
          const assetId = String(
            src?.tpAssetId || src?.video?.assetId || src?.assetId || item?.tpAssetId || item?.assetId || ''
          ).trim();
          const hlsUrl = String(src?.hlsUrl || item?.hlsUrl || src?.video?.url || '').trim();

          const tpStatus = String(src?.tpStatus || item?.tpStatus || '').toUpperCase();
          const status = String(src?.status || item?.status || '').toLowerCase();
          if (
            itemId &&
            !seenIds.has(itemId) &&
            (tpStatus === 'STREAMING' || tpStatus === 'NOT_STARTED' || status === 'live' || status === 'scheduled')
          ) {
            seenIds.add(itemId);
            liveCandidates.push({
              _id: itemId,
              id: itemId,
              title: String(src?.title || item?.title || 'Live Class'),
              courseId,
              courseTitle: titleMap.get(courseId) || '',
              tpAssetId: assetId,
              assetId,
              hlsUrl,
              bannerUrl: src?.thumbnail || src?.bannerUrl || item?.thumbnail || thumbMap.get(courseId) || '/default-thumbnail.png',
              teacher: src?.teacherName || src?.teacher || '',
              startTime: src?.startTime || src?.scheduledAt || src?.createdAt || item?.createdAt,
              status: tpStatus === 'STREAMING' || status === 'live' ? 'LIVE' : 'UPCOMING',
            });
          }
        }

        if (Array.isArray(node.children)) {
          stack.push(...node.children);
        }
      }
    }
  }

  fs.writeFileSync(path.join(STATIC_DATA_DIR, 'live_candidates.json'), JSON.stringify(liveCandidates));
  return {
    liveCount: liveCandidates.length,
  };
}

function getWorkerSource() {
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
  const addonMatch = serverSrc.match(/function buildGbStudyAddonHtml\(\): string \{\s*return `([\s\S]*?)`;\s*\}/);
  if (!addonMatch) {
    throw new Error('Could not extract buildGbStudyAddonHtml from server.ts');
  }
  const ntAddonHtmlLiteral = JSON.stringify(addonMatch[1]);

  const localThumbMap = {};
  const thumbDir = path.join(ROOT, 'public', 'batch_thumbs');
  if (fs.existsSync(thumbDir)) {
    for (const f of fs.readdirSync(thumbDir)) {
      const ext = path.extname(f).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        localThumbMap[path.basename(f, ext)] = `/batch_thumbs/${f}`;
      }
    }
  }
  const localThumbMapLiteral = JSON.stringify(localThumbMap);

  return `// GB STUDY Cloudflare Pages Advanced Mode Worker (_worker.js)
const STUDYX_BASE = 'https://studyxpanda-tb.vercel.app';
const UPSTREAM_BASE = 'https://ais-pre-2nf54bq7hle7qcwczxouzs-561745921472.asia-east1.run.app';
const UPSTREAM_COOKIE = '__SECURE-aistudio_auth_token=one_token_to_rule_them_all';
const TB_DIRECT_API = 'https://seashell-app-3z5jp.ondigitalocean.app/api/v1';
const TPSTREAMS_BASE = 'https://app.tpstreams.com';
const TPSTREAMS_ORG = 'kuepke';
const NT_PLAYER_ADDON_HTML = ${ntAddonHtmlLiteral};
const LOCAL_THUMB_MAP = ${localThumbMapLiteral};

const zA = 'SPIDY_ULTRA_SHIELD_2026_E2EE_MASTER_KEY_V5_998877665544332211_TB_SECURE';
const cM = 'SPIDY_CLIENT_HANDSHAKE_V5_AUTH_2026';

const OFFICIAL_BRAND = 'GB STUDY';
const OFFICIAL_LOGO_SHA256 = 'c35ec411f81c79d4ee978faef351aaff10bd5c3d74305664aad770d31df8342a';
const AUTHORIZED_HOST_TOKENS = ['bh67bu67g7ziwrcfvungkm', '26974065279'];

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return base64ToBytes(b64);
}

let hmacKeyPromise = null;
function getHmacKey() {
  if (!hmacKeyPromise) {
    hmacKeyPromise = crypto.subtle
      .digest('SHA-256', textEncoder.encode(\`\${zA}:\${OFFICIAL_LOGO_SHA256}:pow_clearance_2026\`))
      .then((hash) =>
        crypto.subtle.importKey('raw', hash, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
      );
  }
  return hmacKeyPromise;
}

async function hmacHex(input) {
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(input));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(byteLen = 16) {
  const arr = new Uint8Array(byteLen);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function deriveServerShieldSecret() {
  return \`\${OFFICIAL_BRAND.replace(/\\s+/g, '_')}_\${OFFICIAL_LOGO_SHA256.slice(0, 16)}_SHIELD_2026_LOCK\`;
}

function signGbRequestServer(pathOnly, nonce) {
  const combined = \`\${pathOnly}|\${nonce}|\${deriveServerShieldSecret()}\`;
  let h1 = 2166136261;
  let h2 = 461845907;
  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 16777619);
    h2 ^= ch + (i & 255);
    h2 = Math.imul(h2, 2246822507);
  }
  return \`\${(h1 >>> 0).toString(16).padStart(8, '0')}\${(h2 >>> 0).toString(16).padStart(8, '0')}\`.toLowerCase();
}

function isAllowedClientHost(hostname) {
  const h = (hostname || '').toLowerCase();
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

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      try {
        out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
      }
    }
  }
  return out;
}

async function issueClearanceToken() {
  const ts = Date.now();
  const nonce = randomHex(12);
  const payload = \`\${ts}.\${nonce}\`;
  const sig = (await hmacHex(\`CLR:\${payload}\`)).slice(0, 32);
  return \`\${payload}.\${sig}\`;
}

async function verifyClearanceToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return false;
  const [tsStr, nonce, sig] = parts;
  const ts = Number(tsStr);
  if (!ts || !nonce || !sig) return false;
  if (Date.now() - ts > 24 * 3600 * 1000) return false;
  const expected = (await hmacHex(\`CLR:\${tsStr}.\${nonce}\`)).slice(0, 32);
  return sig === expected;
}

function vm(t, e, n = '') {
  const s = \`\${zA}:\${n}:\${t}:\${e}\`;
  const a = textEncoder.encode(s);
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

function bv(t) {
  const e = \`\${t}:\${cM}:\${zA}\`;
  let n = 2166136261;
  let s = 3421674724;
  for (let a = 0; a < e.length; a++) {
    const l = e.charCodeAt(a);
    n ^= l;
    n = Math.imul(n, 16777619);
    s ^= l + (a & 255);
    s = Math.imul(s, 16777619);
  }
  return \`\${(n >>> 0).toString(16).padStart(8, '0')}\${(s >>> 0).toString(16).padStart(8, '0')}\`;
}

function encryptPayload(t) {
  const e = randomHex(16);
  const n = Date.now();
  const s = JSON.stringify(t === undefined ? null : t);
  const a = textEncoder.encode(s);
  const l = vm(e, n);
  const c = new Uint8Array(a.length);
  let d = 0, m = 0, g = 90;
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
  const E = bytesToBase64(c);
  return { _enc: 1, _v: 'spidy_e2ee_v5', _s: E, _n: e, _t: n, _h: bv(\`\${e}:\${n}:\${E.length}\`) };
}

function decryptPayload(t) {
  if (!t || typeof t !== 'object' || t._enc !== 1) return t;
  const c = base64ToBytes(t._s);
  const d = vm(t._n, t._t);
  const m = new Uint8Array(c.length);
  let g = 0, E = 0, prev = 90;
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
  return JSON.parse(textDecoder.decode(m));
}

function rebrandText(text) {
  return String(text || '')
    .replace(/target\\s*board/gi, 'GB STUDY')
    .replace(/spidy\\s*study/gi, 'GB STUDY')
    .replace(/@spidystudy/gi, '@gbstudy')
    .replace(/study\\s*x?\\s*panda/gi, 'GB STUDY');
}

function rebrandSafeStrings(obj) {
  if (typeof obj === 'string') return rebrandText(obj);
  if (Array.isArray(obj)) return obj.map(rebrandSafeStrings);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'thumbnail' || k === 'bannerUrl' || k === 'pdfUrl' || k === 'url' || k === 'hlsUrl' || k === 'videoUrl' || k === 'streamUrl') {
        out[k] = v;
      } else {
        out[k] = rebrandSafeStrings(v);
      }
    }
    return out;
  }
  return obj;
}

function makeUpstreamHeaders(req) {
  const h = {
    Cookie: UPSTREAM_COOKIE,
    Origin: UPSTREAM_BASE,
    Referer: \`\${UPSTREAM_BASE}/\`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
  if (req) {
    const accept = req.headers.get('accept');
    const range = req.headers.get('range');
    if (accept) h['Accept'] = accept;
    if (range) h['Range'] = range;
  }
  return h;
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

function isSafeExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local') || host.endsWith('.internal')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function sendAuthResponse(req, status, data, preferEncrypted, extraHeaders = {}) {
  const cleaned = rebrandSafeStrings(data);
  const shouldEncrypt = preferEncrypted || req.headers.get('x-spidy-e2ee-req') === '1';
  const bodyObj = shouldEncrypt ? encryptPayload(cleaned) : cleaned;
  if (extraHeaders instanceof Headers) {
    extraHeaders.set('Content-Type', 'application/json; charset=utf-8');
    extraHeaders.set('Cache-Control', 'no-store');
    return new Response(JSON.stringify(bodyObj), { status, headers: extraHeaders });
  }
  return jsonResponse(bodyObj, status, extraHeaders);
}

function makeTbDirectHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8,hi;q=0.7',
    Origin: 'https://targetboard.co.in',
    Referer: 'https://targetboard.co.in/',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    ...extra,
  };
}

function getMaskedMobileHint(mobile) {
  const clean = String(mobile || '').replace(/[^0-9]/g, '').slice(-10);
  return clean.length >= 4 ? \`******\${clean.slice(-4)}\` : '';
}

async function signStatelessToken(prefix, obj) {
  const b64 = toBase64Url(textEncoder.encode(JSON.stringify(obj)));
  const sig = (await hmacHex(\`\${prefix}:\${b64}\`)).slice(0, 28);
  return \`\${prefix}_\${b64}.\${sig}\`;
}

async function verifyStatelessToken(prefix, token) {
  if (!token || !token.startsWith(\`\${prefix}_\`) || !token.includes('.')) return null;
  const bodyPart = token.slice(prefix.length + 1);
  const dot = bodyPart.lastIndexOf('.');
  if (dot <= 0) return null;
  const b64 = bodyPart.slice(0, dot);
  const sig = bodyPart.slice(dot + 1);
  const expected = (await hmacHex(\`\${prefix}:\${b64}\`)).slice(0, 28);
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(textDecoder.decode(fromBase64Url(b64)));
    if (parsed?.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function getSessionDataFromCookie(req) {
  const cookies = parseCookies(req.headers.get('cookie'));
  const sessRaw = cookies['gb_tb_session'];
  const lockRaw = cookies['gb_locked_num'];
  const sessData = sessRaw ? await verifyStatelessToken('gbsess', sessRaw) : null;
  const lockData = lockRaw ? await verifyStatelessToken('gblock', lockRaw) : null;
  const lockedMobile = String(lockData?.mobile || sessData?.mobile || '').replace(/[^0-9]/g, '').slice(-10);
  return {
    token: sessData?.token || '',
    lockedMobile: lockedMobile.length === 10 ? lockedMobile : '',
  };
}

async function getSessionTokenFromCookie(req) {
  const data = await getSessionDataFromCookie(req);
  return data.token || '';
}

async function issueAuthCookieHeaders(isHttps, token, cleanMobile, existingLockedMobile) {
  const lockedNum = existingLockedMobile || (cleanMobile && cleanMobile.length === 10 ? cleanMobile : '');
  const hdrs = new Headers();
  const sameSite = isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax';
  if (token) {
    const sessCookie = await signStatelessToken('gbsess', {
      token,
      mobile: lockedNum,
      exp: Date.now() + 365 * 86400 * 1000,
    });
    hdrs.append('Set-Cookie', \`gb_tb_session=\${encodeURIComponent(sessCookie)}; Path=/; Max-Age=31536000; HttpOnly; \${sameSite}\`);
  }
  if (lockedNum) {
    const lockCookie = await signStatelessToken('gblock', { mobile: lockedNum, lockedAt: Date.now() });
    hdrs.append('Set-Cookie', \`gb_locked_num=\${encodeURIComponent(lockCookie)}; Path=/; Max-Age=315360000; HttpOnly; \${sameSite}\`);
  }
  return hdrs;
}

function stripLegacyPlayerOverlay(html) {
  return html
    .replace(/<style[^>]*id=["']gb-study-player-style["'][^>]*>[\\s\\S]*?<\\/style>/gi, '')
    .replace(/<div[^>]*class=["'][^"']*gb-wm[^"']*["'][^>]*>[\\s\\S]*?<\\/div>/gi, '');
}

function injectNtPlayerAddon(html, isLive = false) {
  let out = stripLegacyPlayerOverlay(html);
  const liveScript = \`<script>window.__gbIsLive = \${isLive ? 'true' : 'false'};</script>\`;
  if (!out.includes('id="nt-player-style"')) {
    out = out.includes('</body>')
      ? out.replace('</body>', liveScript + NT_PLAYER_ADDON_HTML + '</body>')
      : out + liveScript + NT_PLAYER_ADDON_HTML;
  }
  return out;
}

function extractYoutubeVideoId(rawUrl) {
  const s = String(rawUrl || '').trim();
  if (!s) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) {
      return u.pathname.replace(/^\\/+/, '').split('/')[0] || '';
    }
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const m = u.pathname.match(/\\/(?:embed|live|shorts|v)\\/([a-zA-Z0-9_-]{6,})/);
      if (m) return m[1];
    }
  } catch {}
  return '';
}

function renderLocalYoutubePlayerHtml(ytUrlOrId, isLive) {
  const vid = extractYoutubeVideoId(ytUrlOrId);
  const embedSrc = vid
    ? \`https://www.youtube-nocookie.com/embed/\${encodeURIComponent(vid)}?autoplay=1&rel=0&modestbranding=1&playsinline=1\`
    : ytUrlOrId;
  const safeSrc = JSON.stringify(embedSrc);
  return \`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>GB STUDY Live Player</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; font-family: sans-serif; }
    iframe { width: 100%; height: 100%; border: 0; display: block; background: #000; }
    .live-pill { position: fixed; top: 14px; left: 68px; z-index: 20; background: #dc2626; color: #fff; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; letter-spacing: 0.06em; pointer-events: none; }
  </style>
</head>
<body oncontextmenu="return false">
  \${isLive ? '<div class="live-pill">LIVE</div>' : ''}
  <iframe id="yt" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>
  <script>document.getElementById('yt').src = \${safeSrc};</script>
</body>
</html>\`;
}

function renderLocalEmbedPlayerHtml(embedUrl) {
  const safeSrc = JSON.stringify(embedUrl);
  return \`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>GB STUDY Player</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; font-family: sans-serif; }
    iframe { width: 100%; height: 100%; border: 0; display: block; background: #000; }
  </style>
</head>
<body oncontextmenu="return false">
  <iframe id="emb" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>
  <script>document.getElementById('emb').src = \${safeSrc};</script>
</body>
</html>\`;
}

function renderLocalHlsPlayerHtml(hlsUrl, isLive) {
  const safeSrc = JSON.stringify(hlsUrl);
  return \`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>GB STUDY Player</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; font-family: sans-serif; }
    video { width: 100%; height: 100%; max-height: 100dvh; object-fit: contain; background: #000; }
  </style>
</head>
<body oncontextmenu="return false">
  <video id="v" autoplay playsinline controlsList="nodownload"></video>
  <script>
    window.__gbIsLive = \${isLive ? 'true' : 'false'};
    (function(){
      var src = \${safeSrc};
      var video = document.getElementById('v');
      if (window.Hls && window.Hls.isSupported()) {
        var hls = new window.Hls({ enableWorker: true, lowLatencyMode: \${isLive ? 'true' : 'false'}, liveSyncDurationCount: 3, backBufferLength: 60 });
        window.__gbHls = hls;
        var recoverAttempts = 0;
        hls.on(window.Hls.Events.ERROR, function(_ev, data) {
          if (data && data.fatal && recoverAttempts < 4) {
            recoverAttempts += 1;
            if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.MANIFEST_PARSED, function(){ video.play().catch(function(){}); });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.addEventListener('loadedmetadata', function(){ video.play().catch(function(){}); });
      }
    })();
  </script>
  \${NT_PLAYER_ADDON_HTML}
</body>
</html>\`;
}

async function fetchStaticAsset(env, reqUrl, assetPath) {
  return env.ASSETS.fetch(new Request(new URL(assetPath, reqUrl)));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const reqPath = url.pathname;
    const method = request.method.toUpperCase();

    // Protect internal prebuilt JSON files from direct unverified scraping
    if (reqPath.startsWith('/static_data/')) {
      return new Response('Forbidden', { status: 403 });
    }

    // Enforce GB Shield & Cloud PoW Clearance on API and Catalog routes
    if (reqPath.startsWith('/api/v1') || reqPath === '/batches.json') {
      const originHeader = request.headers.get('origin') || '';
      if (originHeader) {
        try {
          if (!isAllowedClientHost(new URL(originHeader).hostname)) {
            return jsonResponse({ success: false, error: 'Unauthorized origin blocked' }, 403);
          }
        } catch {
          return jsonResponse({ success: false, error: 'Invalid origin blocked' }, 403);
        }
      }

      const refererHeader = request.headers.get('referer') || '';
      if (refererHeader) {
        try {
          if (!isAllowedClientHost(new URL(refererHeader).hostname)) {
            return jsonResponse({ success: false, error: 'Unauthorized referer blocked' }, 403);
          }
        } catch {
          return jsonResponse({ success: false, error: 'Invalid referer blocked' }, 403);
        }
      }

      const gbNonce = request.headers.get('x-gb-nonce') || '';
      const gbSig = request.headers.get('x-gb-sig') || '';
      const gbBrand = request.headers.get('x-gb-dom-brand') || '';
      const gbLogoSha = request.headers.get('x-gb-logo-sha') || '';
      const hasAnyShieldHeader = !!(gbNonce || gbSig || gbBrand || gbLogoSha);

      const isProtectedPost =
        method === 'POST' &&
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
          return jsonResponse({ success: false, error: 'Brand lock active: GB STUDY only.' }, 403);
        }
        if (!gbNonce || gbSig !== signGbRequestServer(reqPath, gbNonce)) {
          return jsonResponse({ success: false, error: 'Unauthorized cryptographic signature rejected.' }, 403);
        }
      }

      if (reqPath !== '/api/v1/security/challenge' && reqPath !== '/api/v1/security/verify-human' && isClearanceRequiredApi) {
        const cookies = parseCookies(request.headers.get('cookie'));
        const hdrClr = request.headers.get('x-gb-clearance') || '';
        const okHdr = await verifyClearanceToken(hdrClr);
        const okCookie = await verifyClearanceToken(cookies['gb_clearance']);
        if (!okHdr && !okCookie) {
          return jsonResponse({ success: false, needsSecurityCheck: true, error: 'Cloud security verification required.' }, 428);
        }
      }
    }

    // 1. Security Verification Endpoints
    if (reqPath === '/api/v1/security/challenge' && method === 'GET') {
      const nonce = randomHex(16);
      const ts = Date.now();
      const difficulty = 2;
      const challengeSig = await hmacHex(\`CHAL:\${nonce}:\${ts}:\${difficulty}\`);
      return sendAuthResponse(request, 200, { success: true, nonce, ts, difficulty, challengeSig }, false);
    }

    if (reqPath === '/api/v1/security/verify-human' && method === 'POST') {
      const rawText = await request.text();
      let parsed = {};
      try { parsed = JSON.parse(rawText || '{}'); } catch {}
      const wasEncrypted = parsed?._enc === 1;
      const payload = wasEncrypted ? decryptPayload(parsed) : parsed;
      const nonce = String(payload?.nonce || '');
      const ts = Number(payload?.ts || 0);
      const difficulty = Number(payload?.difficulty || 2);
      const challengeSig = String(payload?.challengeSig || '');
      const solution = String(payload?.solution || '');

      if (!nonce || !ts || !challengeSig || !solution || Date.now() - ts > 120000) {
        return sendAuthResponse(request, 403, { success: false, verified: false, error: 'Challenge expired.' }, wasEncrypted);
      }
      if (payload?.automatedFlag === 1) {
        return sendAuthResponse(request, 403, { success: false, verified: false, error: 'Bot environment blocked.' }, wasEncrypted);
      }
      if (challengeSig !== await hmacHex(\`CHAL:\${nonce}:\${ts}:\${difficulty}\`)) {
        return sendAuthResponse(request, 403, { success: false, verified: false, error: 'Invalid challenge.' }, wasEncrypted);
      }
      const digest = await sha256Hex(\`\${nonce}:\${solution}\`);
      if (!digest.startsWith('0'.repeat(Math.max(1, Math.min(4, difficulty))))) {
        return sendAuthResponse(request, 403, { success: false, verified: false, error: 'Invalid PoW proof.' }, wasEncrypted);
      }

      const clearanceToken = await issueClearanceToken();
      const isHttps = url.protocol === 'https:';
      const cookieHeader = \`gb_clearance=\${encodeURIComponent(clearanceToken)}; Path=/; Max-Age=86400; HttpOnly; \${isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax'}\`;
      return sendAuthResponse(request, 200, { success: true, verified: true, clearanceToken }, wasEncrypted, { 'Set-Cookie': cookieHeader });
    }

    if (reqPath === '/api/v1/system/config' && method === 'GET') {
      return sendAuthResponse(request, 200, {
        success: true,
        keyGeneratorEnabled: false,
        antiInspectEnabled: false,
        telegramModalEnabled: false,
        announcementText: '',
      }, false);
    }

    // 2. Shared Session Status & Save (stored securely in HttpOnly signed cookies with permanent first-number lock)
    if (reqPath === '/api/v1/tb/shared-session' && method === 'GET') {
      const { token, lockedMobile } = await getSessionDataFromCookie(request);
      return sendAuthResponse(
        request,
        200,
        {
          success: true,
          hasSession: !!token,
          authenticated: !!token,
          isLocked: !!lockedMobile,
          lockedMobileHint: getMaskedMobileHint(lockedMobile),
        },
        false
      );
    }

    if (reqPath === '/api/v1/tb/save-student-session' && method === 'POST') {
      const rawText = await request.text();
      let parsed = {};
      try { parsed = JSON.parse(rawText || '{}'); } catch {}
      const wasEncrypted = parsed?._enc === 1;
      const payload = wasEncrypted ? decryptPayload(parsed) : parsed;
      const tok = String(payload?.token || '').trim();
      const candMob = String(payload?.mobile || payload?.user?.mobile || '').replace(/[^0-9]/g, '').slice(-10);
      const { lockedMobile } = await getSessionDataFromCookie(request);
      if (lockedMobile && candMob && candMob !== lockedMobile) {
        return sendAuthResponse(request, 200, { success: true, saved: false, isLocked: true, lockedMobileHint: getMaskedMobileHint(lockedMobile) }, wasEncrypted);
      }
      if (!tok || tok.length < 20 || tok.startsWith('tb_user_token_')) {
        return sendAuthResponse(request, 400, { success: false, message: 'Invalid token' }, wasEncrypted);
      }
      const isHttps = url.protocol === 'https:';
      const cookieHdrs = await issueAuthCookieHeaders(isHttps, tok, candMob, lockedMobile);
      return sendAuthResponse(
        request,
        200,
        { success: true, hasSession: true, authenticated: true, saved: true, isLocked: !!(lockedMobile || candMob), lockedMobileHint: getMaskedMobileHint(lockedMobile || candMob) },
        wasEncrypted,
        cookieHdrs
      );
    }

    // 3. Direct Target Board OTP Flow (with permanent first-number lock)
    if (reqPath === '/api/v1/tb-auth/send-otp' && method === 'POST') {
      const raw = JSON.parse((await request.text()) || '{}');
      const wasEncrypted = raw?._enc === 1;
      const payload = wasEncrypted ? decryptPayload(raw) : raw;
      const cleanMobile = String(payload?.mobile || '').replace(/[^0-9]/g, '').slice(-10);
      if (cleanMobile.length !== 10) {
        return sendAuthResponse(request, 400, { success: false, message: 'कृपया 10 अंकों का सही मोबाइल नंबर दर्ज करें' }, wasEncrypted);
      }
      const { lockedMobile } = await getSessionDataFromCookie(request);
      if (lockedMobile && cleanMobile !== lockedMobile) {
        const hint = getMaskedMobileHint(lockedMobile);
        return sendAuthResponse(request, 400, {
          success: false,
          isLocked: true,
          lockedMobileHint: hint,
          message: \`यह वेबसाइट स्थायी रूप से पहली बार लॉगिन किए गए नंबर (\${hint}) से लॉक है। किसी दूसरे नंबर से लॉगिन नहीं किया जा सकता।\`,
        }, wasEncrypted);
      }
      try {
        const dr = await fetchWithTimeout(\`\${TB_DIRECT_API}/auth/send-otp\`, {
          method: 'POST',
          headers: makeTbDirectHeaders(),
          body: JSON.stringify({ mobile: cleanMobile }),
        }, 9000);
        const dt = await dr.text();
        let dj = {};
        try { dj = JSON.parse(dt); } catch {}
        if (dr.ok) return sendAuthResponse(request, 200, { success: true, smsSent: true, isLocked: !!lockedMobile, lockedMobileHint: getMaskedMobileHint(lockedMobile), message: 'OTP आपके मोबाइल पर SMS द्वारा भेज दिया गया है!' }, wasEncrypted);
        if (dr.status === 429) return sendAuthResponse(request, 200, { success: true, alreadySent: true, message: 'OTP पहले ही भेजा जा चुका है!' }, wasEncrypted);
        return sendAuthResponse(request, dr.status === 403 ? 400 : dr.status, { success: false, message: dj?.message || dj?.error || 'OTP भेजने में त्रुटि हुई' }, wasEncrypted);
      } catch {
        return sendAuthResponse(request, 502, { success: false, message: 'OTP सर्वर से संपर्क नहीं हो पा रहा है।' }, wasEncrypted);
      }
    }

    if (reqPath === '/api/v1/tb-auth/verify-otp' && method === 'POST') {
      const raw = JSON.parse((await request.text()) || '{}');
      const wasEncrypted = raw?._enc === 1;
      const payload = wasEncrypted ? decryptPayload(raw) : raw;
      const cleanMobile = String(payload?.mobile || '').replace(/[^0-9]/g, '').slice(-10);
      const code = String(payload?.code || '').replace(/[^0-9]/g, '').trim();
      if (cleanMobile.length !== 10 || code.length !== 6) {
        return sendAuthResponse(request, 400, { success: false, message: 'कृपया सही मोबाइल नंबर और 6 अंकों का OTP दर्ज करें' }, wasEncrypted);
      }
      const { lockedMobile } = await getSessionDataFromCookie(request);
      if (lockedMobile && cleanMobile !== lockedMobile) {
        const hint = getMaskedMobileHint(lockedMobile);
        return sendAuthResponse(request, 400, {
          success: false,
          isLocked: true,
          lockedMobileHint: hint,
          message: \`यह वेबसाइट स्थायी रूप से पहली बार लॉगिन किए गए नंबर (\${hint}) से लॉक है। किसी दूसरे नंबर से लॉगिन नहीं किया जा सकता।\`,
        }, wasEncrypted);
      }
      try {
        const dr = await fetchWithTimeout(\`\${TB_DIRECT_API}/auth/verify-otp\`, {
          method: 'POST',
          headers: makeTbDirectHeaders(),
          body: JSON.stringify({ mobile: cleanMobile, code }),
        }, 9000);
        const dt = await dr.text();
        let dj = {};
        try { dj = JSON.parse(dt); } catch {}
        const token = dj?.token || dj?.accessToken || dj?.data?.token || '';
        const tempToken = dj?.tempToken || dj?.data?.tempToken || '';
        if (dr.ok && tempToken && !token) {
          return sendAuthResponse(request, 200, { success: true, isNewUser: true, tempToken }, wasEncrypted);
        }
        if (dr.ok && token) {
          const isHttps = url.protocol === 'https:';
          const cookieHdrs = await issueAuthCookieHeaders(isHttps, token, cleanMobile, lockedMobile);
          return sendAuthResponse(
            request,
            200,
            { success: true, authenticated: true, isLocked: true, lockedMobileHint: getMaskedMobileHint(lockedMobile || cleanMobile) },
            wasEncrypted,
            cookieHdrs
          );
        }
        return sendAuthResponse(request, dr.status === 403 ? 400 : (dr.status || 400), { success: false, message: dj?.message || dj?.error || 'गलत OTP कोड।' }, wasEncrypted);
      } catch {
        return sendAuthResponse(request, 502, { success: false, message: 'OTP सत्यापन में त्रुटि हुई।' }, wasEncrypted);
      }
    }

    if (reqPath === '/api/v1/tb-auth/complete-registration' && method === 'POST') {
      const raw = JSON.parse((await request.text()) || '{}');
      const wasEncrypted = raw?._enc === 1;
      const payload = wasEncrypted ? decryptPayload(raw) : raw;
      const cleanMobile = String(payload?.mobile || '').replace(/[^0-9]/g, '').slice(-10);
      const { lockedMobile } = await getSessionDataFromCookie(request);
      if (lockedMobile && cleanMobile && cleanMobile !== lockedMobile) {
        const hint = getMaskedMobileHint(lockedMobile);
        return sendAuthResponse(request, 400, {
          success: false,
          isLocked: true,
          lockedMobileHint: hint,
          message: \`यह वेबसाइट स्थायी रूप से पहली बार लॉगिन किए गए नंबर (\${hint}) से लॉक है। किसी दूसरे नंबर से लॉगिन नहीं किया जा सकता।\`,
        }, wasEncrypted);
      }
      const tempToken = String(payload?.tempToken || '').trim();
      const fullName = String(payload?.fullName || '').trim();
      const classId = String(payload?.classId || '6963936ceefd2beed5d5119b');
      const stateBoardId = String(payload?.stateBoardId || '6963925feefd2beed5d50f7b');
      const mediumId = String(payload?.mediumId || '696398c0eefd2beed5d51922');
      const city = String(payload?.city || 'Patna');
      if (tempToken && fullName) {
        try {
          const step1 = await fetchWithTimeout(\`\${TB_DIRECT_API}/auth/register-step-1\`, {
            method: 'POST',
            headers: makeTbDirectHeaders({ Authorization: \`Bearer \${tempToken}\` }),
            body: JSON.stringify({ fullName }),
          }, 9000);
          if (step1.ok) {
            const step2 = await fetchWithTimeout(\`\${TB_DIRECT_API}/auth/register-step-2\`, {
              method: 'POST',
              headers: makeTbDirectHeaders({ Authorization: \`Bearer \${tempToken}\` }),
              body: JSON.stringify({ classId, stateBoardId, mediumId, city }),
            }, 9000);
            const step2Data = await step2.json().catch(() => ({}));
            const step2Tok = step2Data?.token || step2Data?.accessToken || step2Data?.data?.token || '';
            if (step2.ok && (step2Tok || step2Data?.user || step2Data?.data?.user)) {
              const isHttps = url.protocol === 'https:';
              const finalTok = step2Tok || tempToken;
              const cookieHdrs = await issueAuthCookieHeaders(isHttps, finalTok, cleanMobile, lockedMobile);
              return sendAuthResponse(
                request,
                200,
                { success: true, authenticated: true, isLocked: true, lockedMobileHint: getMaskedMobileHint(lockedMobile || cleanMobile) },
                wasEncrypted,
                cookieHdrs
              );
            }
          }
        } catch {}
      }
      return sendAuthResponse(request, 400, { success: false, message: 'पंजीकरण पूरा नहीं हो सका। कृपया पुनः प्रयास करें।' }, wasEncrypted);
    }

    // 4. Batches Catalog (Direct Target Board student-courses when logged in + StudyX + Edge Cache + static fallback)
    if (reqPath === '/batches.json' && method === 'GET') {
      const normalizeThumb = (rawThumb, rawId, title, classLabel) => {
        if (rawId && LOCAL_THUMB_MAP[rawId]) return LOCAL_THUMB_MAP[rawId];
        const s = typeof rawThumb === 'string' ? rawThumb.trim() : '';
        if (s.startsWith('/api/tb/image')) {
          const q = s.indexOf('?');
          return q !== -1 ? \`/api/v1/tb-image\${s.slice(q)}\` : '/default-thumbnail.png';
        }
        if (s.startsWith('/api/poster') || !s) {
          return \`/api/v1/gb-poster?t=\${encodeURIComponent(rebrandText(title))}&c=\${encodeURIComponent(classLabel || 'Batch')}\`;
        }
        if (s.startsWith('http://') || s.startsWith('https://')) {
          return \`/api/v1/tb-image?url=\${encodeURIComponent(s)}\`;
        }
        return s || '/default-thumbnail.png';
      };

      const sessionTok = await getSessionTokenFromCookie(request);
      const forceRefresh = url.searchParams.get('force') === '1';
      const cacheTag = sessionTok ? 'auth' : 'anon';
      const cacheKey = new Request(\`\${url.origin}/__cache/batches_v2_\${cacheTag}.json\`);
      if (!forceRefresh) {
        try {
          const hit = await caches.default.match(cacheKey);
          if (hit) return hit;
        } catch {}
      }

      const fetchDirectTbCourses = async () => {
        if (!sessionTok) return [];
        try {
          const r = await fetchWithTimeout(\`\${TB_DIRECT_API}/student-courses\`, {
            headers: makeTbDirectHeaders({ Authorization: \`Bearer \${sessionTok}\` }),
          }, 8000);
          if (!r.ok) return [];
          const j = await r.json().catch(() => null);
          const list = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : Array.isArray(j?.courses) ? j.courses : Array.isArray(j?.batches) ? j.batches : [];
          return list.map((c) => {
            const id = String(c?._id || c?.id || '').replace(/^tb-/i, '').trim();
            if (!id) return null;
            const title = rebrandText(String(c?.title || c?.name || 'Course Batch').trim());
            const classLabel = rebrandText(String(c?.classLabel || c?.classId?.name || c?.class?.name || '').trim());
            const rawThumb = c?.thumbnail || c?.courseImage || c?.coverImage || c?.bannerUrl || c?.banner || c?.image;
            return {
              id,
              _id: id,
              sourceId: id,
              title,
              thumbnail: normalizeThumb(rawThumb, id, title, classLabel),
              category: c?.category?.name || c?.category || '',
              classLabel,
            };
          }).filter(Boolean);
        } catch {
          return [];
        }
      };

      const fetchSxCourses = async () => {
        try {
          const sxRes = await fetchWithTimeout(\`\${STUDYX_BASE}/api/courses\`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36', Accept: 'application/json' },
          }, 8000);
          if (!sxRes.ok) return [];
          const j = await sxRes.json().catch(() => null);
          const list = Array.isArray(j?.courses) ? j.courses : [];
          return list.map((c) => {
            const rawSlug = String(c.id || c.slug || '').trim();
            const id = rawSlug.replace(/^tb-/i, '');
            if (!id) return null;
            const title = rebrandText(String(c.title || c.name || 'Course Batch').trim());
            const classLabel = rebrandText(String(c.classLabel || '').trim());
            return {
              id,
              _id: id,
              sourceId: rawSlug,
              title,
              thumbnail: normalizeThumb(c.thumbnail, id, title, classLabel),
              category: c.category || '',
              classLabel,
            };
          }).filter(Boolean);
        } catch {
          return [];
        }
      };

      try {
        const [tbCourses, sxCourses] = await Promise.all([fetchDirectTbCourses(), fetchSxCourses()]);
        const mergedMap = new Map();
        for (const c of sxCourses) if (c?.id) mergedMap.set(c.id, c);
        for (const c of tbCourses) {
          if (c?.id) {
            const prev = mergedMap.get(c.id) || {};
            const betterThumb = prev.thumbnail && prev.thumbnail.startsWith('/batch_thumbs/') ? prev.thumbnail : (c.thumbnail || prev.thumbnail);
            mergedMap.set(c.id, { ...prev, ...c, thumbnail: betterThumb });
          }
        }
        const merged = Array.from(mergedMap.values());
        if (merged.length > 0) {
          const body = JSON.stringify({ new: rebrandSafeStrings(merged) });
          const resp = new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=45' },
          });
          try { ctx.waitUntil(caches.default.put(cacheKey, resp.clone())); } catch {}
          return resp;
        }
      } catch {}

      const staticRes = await fetchStaticAsset(env, request.url, '/static_data/batches.json');
      if (staticRes.ok) {
        try {
          const sj = await staticRes.json();
          const list = Array.isArray(sj?.new) ? sj.new : [];
          return jsonResponse({ new: rebrandSafeStrings(list) });
        } catch {}
      }
      return jsonResponse({ new: [] });
    }

    // 5. Syllabus Tree (Live studyxpanda-tb.vercel.app recursive tree -> Edge Cache -> static_data fallback)
    async function fetchStudyxTreeWorker(rawCourseId) {
      const canonicalId = String(rawCourseId || '').replace(/^tb-/i, '').trim();
      if (!canonicalId) return null;
      const reqHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
      };
      try {
        const courseRes = await fetchWithTimeout(\`\${STUDYX_BASE}/api/courses/tb-\${encodeURIComponent(canonicalId)}\`, { headers: reqHeaders }, 8000);
        if (!courseRes.ok) return null;
        const courseJson = await courseRes.json().catch(() => null);
        const topSubjects = Array.isArray(courseJson?.subjects) ? courseJson.subjects : [];
        if (topSubjects.length === 0) return [];

        const subjectDataMap = new Map();
        const pendingIds = [];
        const seenIds = new Set();
        for (const s of [...topSubjects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
          const sid = String(s?.id || '').trim();
          if (sid && !seenIds.has(sid)) {
            seenIds.add(sid);
            pendingIds.push(sid);
          }
        }

        let fetchedCount = 0;
        while (pendingIds.length > 0 && fetchedCount < 45) {
          const batch = pendingIds.splice(0, 6);
          const responses = await Promise.all(batch.map(async (sid) => {
            fetchedCount += 1;
            try {
              const sr = await fetchWithTimeout(\`\${STUDYX_BASE}/api/subjects/\${encodeURIComponent(sid)}\`, { headers: reqHeaders }, 8000);
              if (!sr.ok) return { sid, data: null };
              return { sid, data: await sr.json().catch(() => null) };
            } catch {
              return { sid, data: null };
            }
          }));
          for (const { sid, data } of responses) {
            if (!data) continue;
            subjectDataMap.set(sid, data);
            for (const sub of (Array.isArray(data.subfolders) ? data.subfolders : [])) {
              const subId = String(sub?.id || '').trim();
              if (subId && !seenIds.has(subId)) {
                seenIds.add(subId);
                pendingIds.push(subId);
              }
            }
          }
        }

        const buildFolder = (sid, fallbackName, ancestry) => {
          if (ancestry.has(sid)) return null;
          const data = subjectDataMap.get(sid);
          if (!data) return null;
          const nextAnc = new Set(ancestry);
          nextAnc.add(sid);
          const children = [];
          for (const sub of [...(Array.isArray(data.subfolders) ? data.subfolders : [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
            const subId = String(sub?.id || '').trim();
            if (!subId) continue;
            const node = buildFolder(subId, String(sub?.name || 'Subject'), nextAnc);
            if (node) children.push(node);
          }
          for (const ch of [...(Array.isArray(data.chapters) ? data.chapters : [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
            const videos = [...(Array.isArray(ch.videos) ? ch.videos : [])]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((v, idx) => ({
                _id: String(v.id || \`\${ch.id}:v\${idx}\`),
                title: rebrandText(String(v.title || 'Lecture Video').trim()),
                type: 'video',
                tpAssetId: String(v.assetId || '').trim(),
                assetId: String(v.assetId || '').trim(),
                ...(typeof v.hlsUrl === 'string' && v.hlsUrl.startsWith('http') ? { hlsUrl: v.hlsUrl } : {}),
                sequence: v.order ?? idx,
              }));
            const pdfs = [...(Array.isArray(ch.pdfs) ? ch.pdfs : [])]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .filter((p) => typeof p?.url === 'string' && p.url.trim().length > 0)
              .map((p, idx) => {
                const pTitle = rebrandText(String(p.title || 'Class Notes').trim());
                return {
                  _id: String(p.id || \`\${ch.id}:p\${idx}\`),
                  title: pTitle,
                  type: 'pdf',
                  pdf: { url: p.url.trim(), fileName: \`\${pTitle.replace(/[^\\w\\s-]/g, '_') || 'notes'}.pdf\` },
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

        const tree = [];
        for (const rootSubj of [...topSubjects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
          const sid = String(rootSubj?.id || '').trim();
          if (!sid) continue;
          const node = buildFolder(sid, String(rootSubj?.name || 'Subject'), new Set());
          if (node) tree.push(node);
        }
        return rebrandSafeStrings(tree);
      } catch {
        return null;
      }
    }

    async function fetchDirectTbTreeWorker(rawCourseId, sessionTok) {
      const canonicalId = String(rawCourseId || '').replace(/^tb-/i, '').trim();
      if (!canonicalId || !sessionTok) return null;
      try {
        const trRes = await fetchWithTimeout(\`\${TB_DIRECT_API}/category/tree-user/\${encodeURIComponent(canonicalId)}/v2\`, {
          headers: makeTbDirectHeaders({ Authorization: \`Bearer \${sessionTok}\` }),
        }, 8500);
        if (!trRes.ok) return null;
        const j = await trRes.json().catch(() => null);
        const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : null;
        if (!arr || arr.length === 0) return null;
        return rebrandSafeStrings(arr);
      } catch {
        return null;
      }
    }

    const treeMatch = reqPath.match(/^\\/api\\/v1\\/category\\/tree-user\\/([a-zA-Z0-9_-]+)\\/v2$/);
    if (treeMatch && method === 'GET') {
      const courseId = treeMatch[1].replace(/^tb-/i, '');
      const sessionTok = await getSessionTokenFromCookie(request);
      const forceRefresh = url.searchParams.get('force') === '1';
      const treeTag = sessionTok ? 'auth' : 'anon';
      const treeCacheKey = new Request(\`\${url.origin}/__cache/tree_v2_\${treeTag}_\${courseId}.json\`);
      if (!forceRefresh) {
        try {
          const hit = await caches.default.match(treeCacheKey);
          if (hit) return hit;
        } catch {}
      }

      if (sessionTok) {
        const tbTree = await fetchDirectTbTreeWorker(courseId, sessionTok);
        if (tbTree && tbTree.length > 0) {
          const resp = new Response(JSON.stringify(tbTree), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=45' },
          });
          try { ctx.waitUntil(caches.default.put(treeCacheKey, resp.clone())); } catch {}
          return resp;
        }
      }

      const liveTree = await fetchStudyxTreeWorker(courseId);
      if (liveTree !== null) {
        const resp = new Response(JSON.stringify(liveTree), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=120' },
        });
        try { ctx.waitUntil(caches.default.put(treeCacheKey, resp.clone())); } catch {}
        return resp;
      }

      const assetRes = await fetchStaticAsset(env, request.url, \`/static_data/trees/\${courseId}.json\`);
      if (assetRes.ok) {
        return new Response(assetRes.body, {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=120' },
        });
      }
      return jsonResponse([]);
    }

    // 6. Active Live & Upcoming Streams (Direct Target Board multi-class live/upcoming + static_data candidates)
    if (reqPath === '/api/v1/tb/active-live-streams' && method === 'GET') {
      const merged = new Map();
      const titleMap = new Map();
      const thumbMap = new Map();
      try {
        const bRes = await fetchStaticAsset(env, request.url, '/static_data/batches.json');
        if (bRes.ok) {
          const bj = await bRes.json().catch(() => null);
          for (const b of bj?.new || []) {
            const bid = String(b?.id || b?._id || '').trim();
            if (!bid) continue;
            if (b.title || b.name) titleMap.set(bid, String(b.title || b.name));
            if (b.thumbnail && b.thumbnail !== '/default-thumbnail.png') thumbMap.set(bid, String(b.thumbnail));
          }
        }
      } catch {}

      const addList = (arr, fallbackStatus) => {
        for (const s of arr || []) {
          if (!s || typeof s !== 'object') continue;
          const id = String(s._id || s.id || s.streamId || s.tpAssetId || s.assetId || '');
          if (!id) continue;
          const stLower = String(s.status || '').toLowerCase();
          const tpUpper = String(s.tpStatus || '').toUpperCase();
          const isLiveNow = tpUpper === 'STREAMING' || stLower === 'live' || s.isLive === true;
          const normalizedStatus = isLiveNow
            ? 'LIVE'
            : (stLower === 'upcoming' || stLower === 'scheduled' || stLower === 'created' || tpUpper === 'NOT_STARTED' || tpUpper === 'SCHEDULED' || fallbackStatus === 'UPCOMING')
              ? 'UPCOMING'
              : fallbackStatus;
          const cId = String(s.courseId?._id || s.courseId || s.course?._id || s.course || '').trim();
          const cTitle = s.courseTitle || s.courseId?.title || s.course?.title || s.subject || (cId ? titleMap.get(cId) : '') || '';
          const resolvedBanner =
            s.bannerUrl || s.banner || s.thumbnail || s.poster || s.image ||
            s.courseId?.thumbnail || s.courseId?.courseImage || s.course?.thumbnail ||
            s.teacher?.profileImage || (cId ? thumbMap.get(cId) : '') || '/default-thumbnail.png';
          const normalizedItem = {
            ...s,
            tpAssetId: s.tpAssetId || s.liveAssetId || s.assetId || s.video?.assetId,
            hlsUrl: s.hlsUrl || s.playbackUrl || s.liveUrl || s.streamUrl || s.m3u8Url || s.youtubeUrl || s.embedUrl || (s.youtubeId ? \`https://www.youtube.com/watch?v=\${s.youtubeId}\` : ''),
            courseId: cId || s.courseId,
            courseIds: cId ? [cId] : [],
            courseTitle: cTitle || s.courseTitle,
            bannerUrl: resolvedBanner,
            status: normalizedStatus,
            startTime: s.startTime || s.scheduledStart || s.scheduledAt || s.scheduledTime || s.createdAt,
          };
          const prev = merged.get(id);
          if (!prev || normalizedStatus === 'LIVE') {
            merged.set(id, {
              ...(prev || {}),
              ...normalizedItem,
              courseIds: Array.from(new Set([...(prev?.courseIds || []), ...(normalizedItem.courseIds || [])].filter(Boolean))),
            });
          }
        }
      };

      const sessionTok = await getSessionTokenFromCookie(request);
      if (sessionTok) {
        try {
          const tbHdrs = makeTbDirectHeaders({ Authorization: \`Bearer \${sessionTok}\` });
          let classIds = [
            '691dc39227195243f5235256',
            '69639890eefd2beed5d5190d',
            '6963989deefd2beed5d51914',
            '696398aceefd2beed5d5191b',
            '696398e1eefd2beed5d51934',
            '696398efeefd2beed5d5193b',
          ];
          try {
            const clsRes = await fetchWithTimeout(\`\${TB_DIRECT_API}/classes\`, {}, 3500);
            if (clsRes.ok) {
              const clsJson = await clsRes.json().catch(() => null);
              if (Array.isArray(clsJson) && clsJson.length > 0) {
                const liveIds = clsJson.map((c) => String(c?._id || c?.id || '')).filter(Boolean);
                if (liveIds.length > 0) classIds = liveIds.slice(0, 8);
              }
            }
          } catch {}

          const queries = [
            { url: \`\${TB_DIRECT_API}/user/streams?type=live\`, kind: 'LIVE' },
            { url: \`\${TB_DIRECT_API}/user/streams?type=upcoming\`, kind: 'UPCOMING' },
          ];
          for (const cid of classIds) {
            queries.push({ url: \`\${TB_DIRECT_API}/user/streams?classId=\${encodeURIComponent(cid)}&type=live\`, kind: 'LIVE' });
            queries.push({ url: \`\${TB_DIRECT_API}/user/streams?classId=\${encodeURIComponent(cid)}&type=upcoming\`, kind: 'UPCOMING' });
          }

          const results = await Promise.all(
            queries.map(async (q) => {
              try {
                const tr = await fetchWithTimeout(q.url, { headers: tbHdrs }, 4500);
                if (!tr.ok) return { list: [], kind: q.kind };
                const j = await tr.json().catch(() => null);
                const list = Array.isArray(j) ? j : Array.isArray(j?.streams) ? j.streams : Array.isArray(j?.data) ? j.data : Array.isArray(j?.activeStreams) ? j.activeStreams : [];
                return { list, kind: q.kind };
              } catch {
                return { list: [], kind: q.kind };
              }
            })
          );
          for (const r of results) addList(r.list, r.kind);
        } catch {}
      }

      try {
        const candRes = await fetchStaticAsset(env, request.url, '/static_data/live_candidates.json');
        if (candRes.ok) addList(await candRes.json(), 'UPCOMING');
      } catch {}

      const sorted = Array.from(merged.values()).sort((a, b) => {
        const aLive = a.status === 'LIVE' ? 0 : 1;
        const bLive = b.status === 'LIVE' ? 0 : 1;
        if (aLive !== bLive) return aLive - bLive;
        const ta = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
        return aLive === 0 ? tb - ta : ta - tb;
      });

      return jsonResponse({ success: true, activeStreams: rebrandSafeStrings(sorted) });
    }

    // 7. Create Stream Ticket (Direct TPStreams -> Direct HLS -> Upstream PLAIN JSON -> Helpful OTP prompt)
    if (reqPath === '/api/v1/tb/create-stream-ticket' && method === 'POST') {
      const rawText = await request.text();
      let parsedReq = {};
      try { parsedReq = JSON.parse(rawText || '{}'); } catch {}
      const wasEncrypted = parsedReq?._enc === 1;
      const payload = wasEncrypted ? decryptPayload(parsedReq) : parsedReq;

      let assetId = String(payload?.assetId || '').trim();
      const streamId = String(payload?.streamId || '').trim();
      const courseId = String(payload?.courseId || '').trim();
      const lectureTitle = String(payload?.title || '').trim();
      let hlsUrl = String(payload?.hlsUrl || '').trim();
      const isLive = !!payload?.isLive;
      const sessionTok = await getSessionTokenFromCookie(request);
      const rawTok = typeof payload?.token === 'string' ? payload.token.trim() : '';
      const effectiveToken = rawTok && !rawTok.startsWith('tb_user_token_') && rawTok.length > 20 ? rawTok : sessionTok;

      const findInTree = (rawTree) => {
        if (!Array.isArray(rawTree)) return null;
        const stack = [...rawTree];
        const normTitle = lectureTitle.toLowerCase();
        let titleHit = null;
        while (stack.length > 0) {
          const node = stack.pop();
          if (!node || typeof node !== 'object') continue;
          const buckets = [
            ...(Array.isArray(node.lessons) ? node.lessons : []),
            ...(Array.isArray(node.streams) ? node.streams : []),
            ...(Array.isArray(node.contents) ? node.contents : []),
          ];
          for (const item of buckets) {
            const src = item?.refId && typeof item.refId === 'object' ? item.refId : (item?.source && typeof item.source === 'object' ? item.source : item);
            const itemIds = [item?._id, item?.id, src?._id, src?.id].filter(Boolean).map(String);
            const fa = String(src?.tpAssetId || src?.liveAssetId || src?.video?.assetId || src?.assetId || item?.tpAssetId || item?.liveAssetId || item?.assetId || '').trim();
            const rawYtId = String(src?.youtubeId || item?.youtubeId || '').trim();
            const fh = String(src?.hlsUrl || item?.hlsUrl || src?.playbackUrl || item?.playbackUrl || src?.liveUrl || item?.liveUrl || src?.streamUrl || item?.streamUrl || src?.m3u8Url || item?.m3u8Url || src?.video?.url || src?.youtubeUrl || item?.youtubeUrl || src?.embedUrl || item?.embedUrl || (rawYtId ? \`https://www.youtube.com/watch?v=\${rawYtId}\` : '') || '').trim();
            const hasRaw = (fa && !fa.startsWith('vid_')) || fh.startsWith('http');
            if (streamId && itemIds.includes(streamId) && (hasRaw || fa || fh)) return { a: fa, h: fh };
            if (!titleHit && normTitle && hasRaw && String(src?.title || item?.title || '').trim().toLowerCase() === normTitle) {
              titleHit = { a: fa, h: fh };
            }
          }
          if (Array.isArray(node.children)) stack.push(...node.children);
        }
        return titleHit;
      };

      let tbAccessDenied = false;

      if (streamId && effectiveToken && (isLive || !assetId || assetId.startsWith('vid_') || !hlsUrl || hlsUrl.startsWith('/api/v1/secure/'))) {
        try {
          const stRes = await fetchWithTimeout(\`\${TB_DIRECT_API}/streams/\${encodeURIComponent(streamId)}\`, {
            headers: makeTbDirectHeaders({ Authorization: \`Bearer \${effectiveToken}\` }),
          }, 5500);
          if (stRes.status === 401 || stRes.status === 403) {
            tbAccessDenied = true;
          } else if (stRes.ok) {
            const stJson = await stRes.json().catch(() => null);
            const stObj = stJson?.stream || stJson?.data || stJson;
            const stAsset = String(stObj?.tpAssetId || stObj?.liveAssetId || stObj?.video?.assetId || stObj?.assetId || '').trim();
            if (stAsset && !stAsset.startsWith('vid_')) assetId = stAsset;
            const stYtId = String(stObj?.youtubeId || '').trim();
            const stUrl = String(stObj?.hlsUrl || stObj?.playbackUrl || stObj?.liveUrl || stObj?.streamUrl || stObj?.m3u8Url || stObj?.videoUrl || stObj?.youtubeUrl || stObj?.embedUrl || (stYtId ? \`https://www.youtube.com/watch?v=\${stYtId}\` : '') || '').trim();
            if (stUrl && stUrl.startsWith('http')) hlsUrl = stUrl;
          }
        } catch {}
      }

      if ((!assetId || assetId.startsWith('vid_') || !hlsUrl.startsWith('http')) && courseId && effectiveToken) {
        try {
          const trRes = await fetchWithTimeout(\`\${TB_DIRECT_API}/category/tree-user/\${encodeURIComponent(courseId)}/v2\`, {
            headers: makeTbDirectHeaders({ Authorization: \`Bearer \${effectiveToken}\` }),
          }, 7000);
          if (trRes.ok) {
            const j = await trRes.json().catch(() => null);
            const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : null;
            if (arr && arr.length > 0) {
              const hit = findInTree(arr);
              if (hit) {
                if (hit.a && !hit.a.startsWith('vid_')) assetId = hit.a;
                if (hit.h && hit.h.startsWith('http')) hlsUrl = hit.h;
              }
            } else {
              tbAccessDenied = true;
            }
          } else if (trRes.status === 401 || trRes.status === 403) {
            tbAccessDenied = true;
          }
        } catch {}
      }

      // Priority 1: Direct TPStreams token when unencrypted assetId & shared token exist
      if (assetId && !assetId.startsWith('vid_') && effectiveToken) {
        try {
          const tkRes = await fetchWithTimeout(\`\${TB_DIRECT_API}/tpstreams/token/\${encodeURIComponent(assetId)}\`, {
            method: 'POST',
            headers: makeTbDirectHeaders({ Authorization: \`Bearer \${effectiveToken}\` }),
            body: '{}',
          }, 7000);
          if (tkRes.status === 401 || tkRes.status === 403) {
            tbAccessDenied = true;
          } else if (tkRes.ok) {
            const tkJson = await tkRes.json().catch(() => null);
            const accessToken = tkJson?.code || tkJson?.access_token || tkJson?.data?.code;
            const tkHls = String(tkJson?.hlsUrl || tkJson?.playbackUrl || tkJson?.playback_url || tkJson?.data?.hlsUrl || '').trim();
            if (typeof accessToken === 'string' && accessToken.length > 0) {
              const ticket = await signStatelessToken('cfstk', {
                kind: 'tpstreams',
                assetId,
                accessToken,
                isLive,
                exp: Date.now() + 2 * 3600 * 1000,
              });
              return sendAuthResponse(request, 200, { success: true, watchUrl: \`/api/v1/stream/watch/\${ticket}\` }, wasEncrypted);
            }
            if (tkHls && isSafeExternalUrl(tkHls)) {
              const ticket = await signStatelessToken('cfstk', { kind: 'hls', hlsUrl: tkHls, isLive, exp: Date.now() + 2 * 3600 * 1000 });
              return sendAuthResponse(request, 200, { success: true, watchUrl: \`/api/v1/stream/watch/\${ticket}\` }, wasEncrypted);
            }
          }
        } catch {}
      }

      // Priority 2: Direct YouTube Live URL/ID
      const ytId = hlsUrl ? extractYoutubeVideoId(hlsUrl) : '';
      if (ytId) {
        const ticket = await signStatelessToken('cfstk', { kind: 'youtube', youtubeUrl: hlsUrl, isLive, exp: Date.now() + 2 * 3600 * 1000 });
        return sendAuthResponse(request, 200, { success: true, watchUrl: \`/api/v1/stream/watch/\${ticket}\` }, wasEncrypted);
      }

      // Priority 3: Direct .m3u8 HLS URL
      if (hlsUrl && isSafeExternalUrl(hlsUrl) && hlsUrl.includes('.m3u8')) {
        const ticket = await signStatelessToken('cfstk', { kind: 'hls', hlsUrl, isLive, exp: Date.now() + 2 * 3600 * 1000 });
        return sendAuthResponse(request, 200, { success: true, watchUrl: \`/api/v1/stream/watch/\${ticket}\` }, wasEncrypted);
      }

      if ((!assetId || assetId.startsWith('vid_') || !hlsUrl || hlsUrl.startsWith('/api/v1/secure/')) && courseId) {
        try {
          const staticTreeRes = await fetchStaticAsset(env, request.url, \`/static_data/trees/\${courseId.replace(/^tb-/i, '')}.json\`);
          if (staticTreeRes.ok) {
            const hit = findInTree(await staticTreeRes.json().catch(() => null));
            if (hit) {
              if (hit.a && !hit.a.startsWith('vid_')) assetId = hit.a;
              if (hit.h && hit.h.startsWith('http')) hlsUrl = hit.h;
            }
          }
        } catch {}
        if (!assetId || assetId.startsWith('vid_')) {
          const liveTree = await fetchStudyxTreeWorker(courseId);
          const hit = findInTree(liveTree);
          if (hit) {
            if (hit.a && !hit.a.startsWith('vid_')) assetId = hit.a;
            if (hit.h && hit.h.startsWith('http')) hlsUrl = hit.h;
          }
        }
      }

      // Priority 4: StudyX video resolution endpoint (/api/tb/video/<assetId>)
      if (assetId && !assetId.startsWith('vid_')) {
        try {
          const sxRes = await fetchWithTimeout(\`\${STUDYX_BASE}/api/tb/video/\${encodeURIComponent(assetId)}\`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36', Accept: 'application/json' },
          }, 7000);
          if (sxRes.ok) {
            const sxJson = await sxRes.json().catch(() => null);
            const sxHls = String(sxJson?.hlsUrl || '').trim();
            if (sxHls && isSafeExternalUrl(sxHls)) {
              const ticket = await signStatelessToken('cfstk', { kind: 'hls', hlsUrl: sxHls, isLive, exp: Date.now() + 2 * 3600 * 1000 });
              return sendAuthResponse(request, 200, { success: true, watchUrl: \`/api/v1/stream/watch/\${ticket}\` }, wasEncrypted);
            }
            const sxEmbed = String(sxJson?.embedUrl || '').trim();
            if (sxEmbed && isSafeExternalUrl(sxEmbed)) {
              const embUrl = sxEmbed.replace('autoplay=0', 'autoplay=1');
              const embRes = await fetchWithTimeout(embUrl, {
                headers: { Origin: 'https://targetboard.co.in', Referer: 'https://targetboard.co.in/' },
              }, 6000);
              if (embRes.ok) {
                const htmlCheck = await embRes.text();
                if (!htmlCheck.includes('<title>Not Found</title>') && !htmlCheck.includes('<h1>Not Found</h1>')) {
                  const ticket = await signStatelessToken('cfstk', { kind: 'embed', embedUrl: embUrl, isLive, exp: Date.now() + 2 * 3600 * 1000 });
                  return sendAuthResponse(request, 200, { success: true, watchUrl: \`/api/v1/stream/watch/\${ticket}\` }, wasEncrypted);
                }
              }
            }
          }
        } catch {}
      }

      // Priority 5: Direct external HTTPS HLS or Embed URL
      if (hlsUrl && isSafeExternalUrl(hlsUrl)) {
        const looksEmbed = hlsUrl.includes('/embed') || hlsUrl.includes('tpstreams.com/embed');
        const ticket = await signStatelessToken('cfstk', looksEmbed
          ? { kind: 'iframe_embed', embedUrl: hlsUrl, isLive, exp: Date.now() + 2 * 3600 * 1000 }
          : { kind: 'hls', hlsUrl, isLive, exp: Date.now() + 2 * 3600 * 1000 }
        );
        return sendAuthResponse(request, 200, { success: true, watchUrl: \`/api/v1/stream/watch/\${ticket}\` }, wasEncrypted);
      }

      return sendAuthResponse(
        request,
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
    }
    // end of create-stream-ticket

    // 8. Watch Player Endpoint
    const watchMatch = reqPath.match(/^\\/api\\/v1\\/stream\\/watch\\/([^/]+)$/);
    if (watchMatch && method === 'GET') {
      const ticket = watchMatch[1];
      const meta = await verifyStatelessToken('cfstk', ticket);
      if (meta) {
        if (meta.kind === 'youtube' && meta.youtubeUrl) {
          return new Response(renderLocalYoutubePlayerHtml(meta.youtubeUrl, !!meta.isLive), {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
          });
        }
        if (meta.kind === 'iframe_embed' && meta.embedUrl) {
          return new Response(renderLocalEmbedPlayerHtml(meta.embedUrl), {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
          });
        }
        if (meta.kind === 'hls' && meta.hlsUrl) {
          return new Response(renderLocalHlsPlayerHtml(meta.hlsUrl, !!meta.isLive), {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
          });
        }
        if (meta.kind === 'embed' && meta.embedUrl) {
          const embRes = await fetchWithTimeout(meta.embedUrl, {
            headers: { Origin: 'https://targetboard.co.in', Referer: 'https://targetboard.co.in/' },
          }, 10000);
          if (embRes.ok) {
            const html = injectNtPlayerAddon(rebrandText(await embRes.text()), !!meta.isLive);
            return new Response(html, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
            });
          }
        }
        if (meta.kind === 'tpstreams' && meta.assetId && meta.accessToken) {
          const embedUrl = \`\${TPSTREAMS_BASE}/embed/\${TPSTREAMS_ORG}/\${encodeURIComponent(meta.assetId)}/?access_token=\${encodeURIComponent(meta.accessToken)}&autoplay=1\`;
          const tpRes = await fetchWithTimeout(embedUrl, {
            headers: { Origin: 'https://targetboard.co.in', Referer: 'https://targetboard.co.in/' },
          }, 10000);
          if (tpRes.ok) {
            const html = injectNtPlayerAddon(rebrandText(await tpRes.text()), !!meta.isLive);
            return new Response(html, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
            });
          }
        }
      }
      return new Response('<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#fff;font-family:sans-serif;">Session ticket expired. Please close and click Retry.</div>', {
        status: 410,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    // 9. Branded GB STUDY SVG Poster Generator
    if (reqPath === '/api/v1/gb-poster' && method === 'GET') {
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const titleRaw = rebrandText(String(url.searchParams.get('t') || 'GB STUDY Batch').trim()).slice(0, 72);
      const classRaw = rebrandText(String(url.searchParams.get('c') || '2026-27').trim()).slice(0, 24);
      const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#312e81"/><stop offset="55%" stop-color="#5a4bda"/><stop offset="100%" stop-color="#059669"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/><circle cx="710" cy="70" r="120" fill="#ffffff" opacity="0.07"/><circle cx="90" cy="390" r="140" fill="#000000" opacity="0.14"/><rect x="44" y="38" width="144" height="40" rx="20" fill="#ffd600"/><text x="116" y="64" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="800" fill="#111827">GB STUDY</text><rect x="202" y="38" width="150" height="40" rx="20" fill="#000000" opacity="0.28"/><text x="277" y="64" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="#ffffff">\${esc(classRaw)}</text><foreignObject x="44" y="116" width="712" height="220"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family: system-ui, -apple-system, sans-serif; color: #ffffff; font-size: 36px; font-weight: 800; line-height: 1.25; display: flex; align-items: center; height: 220px;">\${esc(titleRaw)}</div></foreignObject><rect x="0" y="378" width="800" height="72" fill="#000000" opacity="0.28"/><text x="44" y="422" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="#ffd600">ALL LECTURES &amp; PDF NOTES UNLOCKED</text></svg>\`;
      return new Response(svg, {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
      });
    }

    // 10. StudyX / Target Board / DigitalOcean Image Proxy
    if (reqPath === '/api/v1/tb-image' && method === 'GET') {
      const rawParam = String(url.searchParams.get('url') || '').trim();
      const targetUrl = rawParam.startsWith('/') ? \`\${STUDYX_BASE}\${rawParam}\` : rawParam;
      if (targetUrl && isSafeExternalUrl(targetUrl)) {
        try {
          const imgHdrs = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
            Referer: 'https://targetboard.co.in/',
          };
          try {
            if (new URL(targetUrl).hostname === 'seashell-app-3z5jp.ondigitalocean.app') {
              const sTok = await getSessionTokenFromCookie(request);
              if (sTok) imgHdrs['Authorization'] = \`Bearer \${sTok}\`;
            }
          } catch {}
          const imgRes = await fetchWithTimeout(targetUrl, { headers: imgHdrs }, 9000);
          const ct = (imgRes.headers.get('content-type') || '').toLowerCase();
          if (imgRes.ok && ct.startsWith('image/')) {
            return new Response(imgRes.body, {
              status: 200,
              headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' },
            });
          }
        } catch {}
      }
      return fetchStaticAsset(env, request.url, '/default-thumbnail.png');
    }

    // 11. PDF Proxy (supports DigitalOcean Spaces, Target Board & StudyX paths)
    if (reqPath === '/api/v1/pdf-proxy' && method === 'GET') {
      const rawParam = (url.searchParams.get('url') || '').trim();
      const targetUrl = rawParam.startsWith('/') ? \`\${STUDYX_BASE}\${rawParam}\` : rawParam;
      if (!targetUrl || !isSafeExternalUrl(targetUrl)) {
        return jsonResponse({ success: false, error: 'Invalid PDF URL' }, 400);
      }
      try {
        const pdfHdrs = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/pdf,*/*',
          Referer: 'https://targetboard.co.in/',
        };
        try {
          if (new URL(targetUrl).hostname === 'seashell-app-3z5jp.ondigitalocean.app') {
            const sTok = await getSessionTokenFromCookie(request);
            if (sTok) pdfHdrs['Authorization'] = \`Bearer \${sTok}\`;
          }
        } catch {}
        const pdfRes = await fetchWithTimeout(targetUrl, { headers: pdfHdrs }, 20000);
        return new Response(pdfRes.body, {
          status: pdfRes.status,
          headers: {
            'Content-Type': pdfRes.headers.get('content-type') || 'application/pdf',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      } catch {
        return jsonResponse({ success: false, error: 'Failed to load PDF' }, 502);
      }
    }

    // 10. TPStreams DRM/API calls (/api/v1/kuepke/*)
    if (reqPath.startsWith('/api/v1/kuepke/')) {
      const tpHeaders = {
        Origin: TPSTREAMS_BASE,
        Referer: \`\${TPSTREAMS_BASE}/\`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      };
      for (const k of ['content-type', 'accept', 'x-csrftoken', 'x-requested-with']) {
        const v = request.headers.get(k);
        if (v) tpHeaders[k] = v;
      }
      const init = { method, headers: tpHeaders };
      if (method !== 'GET' && method !== 'HEAD') init.body = await request.arrayBuffer();
      const tpRes = await fetchWithTimeout(\`\${TPSTREAMS_BASE}\${reqPath}\${url.search}\`, init, 10000);
      const resHdrs = new Headers();
      for (const h of ['content-type', 'cache-control', 'content-length']) {
        const val = tpRes.headers.get(h);
        if (val) resHdrs.set(h, val);
      }
      resHdrs.set('Access-Control-Allow-Origin', '*');
      return new Response(tpRes.body, { status: tpRes.status, headers: resHdrs });
    }

    // 11. Images with fallback
    if (reqPath.startsWith('/api/v1/secure/img/') || reqPath.startsWith('/batch_thumbs/')) {
      if (reqPath.startsWith('/batch_thumbs/')) {
        const localAsset = await env.ASSETS.fetch(request);
        if (localAsset.ok) return localAsset;
      }
      return fetchStaticAsset(env, request.url, '/default-thumbnail.png');
    }

    // 12. Remaining /api/* and /vg/* upstream proxy (covers /api/v1/secure/video/*, /api/v1/secure/doc/*, etc.)
    if (reqPath.startsWith('/api/') || reqPath.startsWith('/vg/')) {
      const upInit = { method, headers: makeUpstreamHeaders(request), redirect: 'follow' };
      const ct = request.headers.get('content-type');
      if (ct) upInit.headers['Content-Type'] = ct;
      if (method !== 'GET' && method !== 'HEAD') {
        upInit.body = await request.arrayBuffer();
      }
      try {
        const uRes = await fetchWithTimeout(\`\${UPSTREAM_BASE}\${reqPath}\${url.search}\`, upInit, 15000);
        const resHeaders = new Headers();
        for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) {
          const val = uRes.headers.get(h);
          if (val) resHeaders.set(h, val);
        }
        return new Response(uRes.body, { status: uRes.status, headers: resHeaders });
      } catch {
        return jsonResponse({ success: false, error: 'Media server unreachable.' }, 502);
      }
    }

    // 13. Static Frontend Assets + SPA index.html fallback
    const assetRes = await env.ASSETS.fetch(request);
    if (assetRes.status === 404 && !reqPath.includes('.')) {
      return fetchStaticAsset(env, request.url, '/index.html');
    }
    return assetRes;
  },
};
`;
}

function main() {
  console.log('1. Building clean production frontend via vite build...');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

  console.log('2. Preparing lean .cf_dist directory...');
  ensureCleanDir(CF_DIST);
  fs.mkdirSync(STATIC_DATA_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_ZIP), { recursive: true });

  // Copy dist/ excluding chat attachment folders and developer helper images
  copyRecursive(path.join(ROOT, 'dist'), CF_DIST);
  const chatAssetsPath = path.join(CF_DIST, 'assets', 'aistudio');
  if (fs.existsSync(chatAssetsPath)) {
    fs.rmSync(chatAssetsPath, { recursive: true, force: true });
  }
  const devImg = path.join(CF_DIST, 'developer.png');
  if (fs.existsSync(devImg)) {
    fs.rmSync(devImg, { force: true });
  }

  // Copy compact batches.json + live_candidates.json only (~26 KB total)
  // Full syllabus trees & stream tickets fetch live from UPSTREAM_BASE/TB_DIRECT_API
  // keeping Cloudflare Pages Direct Upload payload under ~4.5 MB so uploads never hit asset batch limits.
  const batchesSrc = path.join(ROOT, 'catalog_cache', 'batches.json');
  if (fs.existsSync(batchesSrc)) {
    fs.copyFileSync(batchesSrc, path.join(STATIC_DATA_DIR, 'batches.json'));
  }
  const idxStats = buildLiveCandidatesIndex();

  // Write _worker.js & _headers
  const workerPath = path.join(CF_DIST, '_worker.js');
  fs.writeFileSync(workerPath, getWorkerSource(), 'utf8');
  execSync(`node --check "${workerPath}"`, { stdio: 'inherit' });

  fs.writeFileSync(
    path.join(CF_DIST, '_headers'),
    `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer-when-downgrade\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`,
    'utf8'
  );

  // Create clean standard ZIP (root contains index.html, _worker.js, assets/, etc.)
  console.log('3. Compressing lean .cf_dist into data/gbstudytb-cloudflare.zip...');
  if (fs.existsSync(OUTPUT_ZIP)) fs.rmSync(OUTPUT_ZIP, { force: true });

  execSync(
    `python3 -c '
import os, time, zipfile
root_dir = "${CF_DIST}"
out_zip = "${OUTPUT_ZIP}"
file_count = 0
total_raw = 0
max_size = 0
max_name = ""
now = time.localtime()[:6]
with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for cur, dirs, files in os.walk(root_dir):
        dirs[:] = sorted([d for d in dirs if not d.startswith(".")])
        for f in sorted(files):
            if f.startswith("."):
                continue
            full = os.path.join(cur, f)
            rel = os.path.relpath(full, root_dir).replace(os.sep, "/")
            sz = os.path.getsize(full)
            total_raw += sz
            if sz > max_size:
                max_size = sz
                max_name = rel
            zi = zipfile.ZipInfo(rel, date_time=now)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o100644 << 16
            with open(full, "rb") as fp:
                zf.writestr(zi, fp.read())
            file_count += 1
print(f"ZIP created: {out_zip} | files={file_count} | raw_bytes={total_raw} | zip_bytes={os.path.getsize(out_zip)} | largest_file={max_name} ({max_size} bytes)")
'`,
    { stdio: 'inherit' }
  );

  fs.rmSync(CF_DIST, { recursive: true, force: true });
  console.log('Indexes built:', idxStats);
}

main();
