import {
  getClearanceToken,
  getVerifiedDomBrand,
  isShieldIntact,
  OFFICIAL_LOGO_SHA256,
  setClearanceToken,
  signGbRequest,
} from './gbShield';

declare global {
  interface Window {
    __SPIDY_E2EE_VERIFIED__?: boolean;
    __SPIDY_PLAYER_KEY__?: string;
  }
}

const MASTER_KEY = 'SPIDY_ULTRA_SHIELD_2026_E2EE_MASTER_KEY_V5_998877665544332211_TB_SECURE';
const HANDSHAKE_KEY = 'SPIDY_CLIENT_HANDSHAKE_V5_AUTH_2026';

function randomHex(byteLen = 16): string {
  const arr = new Uint8Array(byteLen);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function initPlayerShieldGlobals(): string {
  if (typeof window === 'undefined') return '';
  try {
    if (!window.__SPIDY_E2EE_VERIFIED__) {
      Object.defineProperty(window, '__SPIDY_E2EE_VERIFIED__', {
        value: true,
        writable: false,
        configurable: false,
      });
    }
  } catch {
    window.__SPIDY_E2EE_VERIFIED__ = true;
  }
  try {
    if (!window.__SPIDY_PLAYER_KEY__) {
      Object.defineProperty(window, '__SPIDY_PLAYER_KEY__', {
        value: randomHex(12),
        writable: false,
        configurable: false,
      });
    }
  } catch {
    window.__SPIDY_PLAYER_KEY__ = window.__SPIDY_PLAYER_KEY__ || randomHex(12);
  }
  return window.__SPIDY_PLAYER_KEY__ || '';
}

export function getPlayerKey(): string {
  return initPlayerShieldGlobals();
}

if (typeof window !== 'undefined') {
  initPlayerShieldGlobals();
}

function deriveKeyStream(nonce: string | number, ts: string | number, salt = ''): Uint8Array {
  const seed = `${MASTER_KEY}:${salt}:${nonce}:${ts}`;
  const encoded = new TextEncoder().encode(seed);
  const sbox = new Uint8Array(256);
  for (let i = 0; i < 256; i++) sbox[i] = i;
  let j = 0;
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 256; i++) {
      j = (j + sbox[i] + encoded[i % encoded.length] + i * 29 + round * 13) & 255;
      const tmp = sbox[i];
      sbox[i] = sbox[j];
      sbox[j] = tmp;
    }
  }
  return sbox;
}

function signHandshake(input: string): string {
  const combined = `${input}:${HANDSHAKE_KEY}:${MASTER_KEY}`;
  let h1 = 2166136261;
  let h2 = 3421674724;
  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 16777619);
    h2 ^= ch + (i & 255);
    h2 = Math.imul(h2, 16777619);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function encryptPayload(payload: unknown) {
  const nonce = randomHex(16);
  const ts = Date.now();
  const raw = JSON.stringify(payload === undefined ? null : payload);
  const input = new TextEncoder().encode(raw);
  const sbox = deriveKeyStream(nonce, ts);
  const out = new Uint8Array(input.length);
  let i = 0;
  let j = 0;
  let prev = 90;
  for (let idx = 0; idx < input.length; idx++) {
    i = (i + 1) & 255;
    j = (j + sbox[i]) & 255;
    const tmp = sbox[i];
    sbox[i] = sbox[j];
    sbox[j] = tmp;
    const k = sbox[(sbox[i] + sbox[j]) & 255];
    const cipherByte = (input[idx] ^ k ^ prev) & 255;
    out[idx] = cipherByte;
    prev = (cipherByte + k) & 255;
  }
  const encodedStr = bytesToBase64(out);
  return {
    _enc: 1,
    _v: 'spidy_e2ee_v5',
    _s: encodedStr,
    _n: nonce,
    _t: ts,
    _h: signHandshake(`${nonce}:${ts}:${encodedStr.length}`),
  };
}

export function decryptPayload<T = any>(envelope: any): T {
  if (!envelope || typeof envelope !== 'object' || envelope._enc !== 1 || typeof envelope._s !== 'string') {
    return envelope as T;
  }
  const cipher = base64ToBytes(envelope._s);
  const sbox = deriveKeyStream(envelope._n, envelope._t);
  const out = new Uint8Array(cipher.length);
  let i = 0;
  let j = 0;
  let prev = 90;
  for (let idx = 0; idx < cipher.length; idx++) {
    i = (i + 1) & 255;
    j = (j + sbox[i]) & 255;
    const tmp = sbox[i];
    sbox[i] = sbox[j];
    sbox[j] = tmp;
    const k = sbox[(sbox[i] + sbox[j]) & 255];
    const ch = cipher[idx];
    out[idx] = (ch ^ k ^ prev) & 255;
    prev = (ch + k) & 255;
  }
  return JSON.parse(new TextDecoder().decode(out)) as T;
}

export async function apiJson<T = any>(
  url: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    cache?: RequestCache;
  } = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  if (!isShieldIntact()) {
    throw new Error(
      'मैं इस वेबसाइट का नाम (GB STUDY) और आइकन बदल नहीं सकती। अनधिकृत क्लोन या ब्रांड छेड़छाड़ ब्लॉक है।'
    );
  }

  const method = (options.method || 'GET').toUpperCase();
  const pathOnly = url.split('?')[0];
  const gbNonce = randomHex(8);
  const gbSig = signGbRequest(pathOnly, gbNonce);

  const clearance = getClearanceToken();
  const headers: Record<string, string> = {
    ...(options.headers || {}),
    'X-Gb-Nonce': gbNonce,
    'X-Gb-Sig': gbSig,
    'X-Gb-Dom-Brand': getVerifiedDomBrand(),
    'X-Gb-Logo-Sha': OFFICIAL_LOGO_SHA256,
    ...(clearance ? { 'X-Gb-Clearance': clearance } : {}),
  };

  let fetchBody: string | undefined;
  if (method !== 'GET' && method !== 'HEAD' && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['X-Spidy-E2EE-Req'] = '1';
    fetchBody = JSON.stringify(encryptPayload(options.body));
  }

  const res = await fetch(url, {
    method,
    headers,
    body: fetchBody,
    cache: options.cache,
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed._enc === 1) {
      parsed = decryptPayload(parsed);
    }
  } catch {
    const trimmed = (text || '').trim();
    const isHtml =
      /^\s*<(!doctype|html|head|body)/i.test(trimmed) || trimmed.toLowerCase().includes('<html');
    if (isHtml) {
      const friendlyMsg =
        res.status === 403
          ? 'सुरक्षा सत्यापन अस्थायी रूप से ब्लॉक हुआ। कृपया पेज रिफ्रेश करके पुनः प्रयास करें।'
          : res.status === 429
            ? 'बहुत अधिक प्रयास किए गए। कृपया थोड़ी देर बाद पुनः प्रयास करें।'
            : res.status >= 500
              ? 'सर्वर अस्थायी रूप से व्यस्त है। कृपया कुछ सेकंड बाद पुनः प्रयास करें।'
              : 'सर्वर से अमान्य प्रतिक्रिया प्राप्त हुई। कृपया पुनः प्रयास करें।';
      parsed = { success: false, message: friendlyMsg, error: friendlyMsg };
    } else {
      parsed = { message: trimmed || 'अज्ञात सर्वर त्रुटि।' };
    }
  }

  if (
    (res.status === 401 || res.status === 403 || res.status === 428) &&
    parsed?.needsSecurityCheck &&
    typeof window !== 'undefined'
  ) {
    setClearanceToken('');
    window.dispatchEvent(new CustomEvent('gb-require-security-check'));
  }

  return {
    ok: res.ok,
    status: res.status,
    data: parsed as T,
  };
}
