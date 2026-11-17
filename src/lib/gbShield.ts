export const OFFICIAL_BRAND = 'GB STUDY';
export const OFFICIAL_LOGO_SHA256 =
  'c35ec411f81c79d4ee978faef351aaff10bd5c3d74305664aad770d31df8342a';
export const OFFICIAL_FAVICON_SHA256 =
  '851da1827173bbf9af9fda7683590c7855deb771078cd9ebf64c857876e84b8f';

const AUTHORIZED_HOST_TOKENS = ['bh67bu67g7ziwrcfvungkm', '26974065279'];

let cachedLogoShaVerified: boolean | null = null;

export function isAuthorizedHostAndFrame(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  const host = (window.location.hostname || '').toLowerCase();

  if (host === 'localhost' || host === '127.0.0.1') {
    return true;
  }

  if (
    host === 'gbstudytb.pages.dev' ||
    host.endsWith('.gbstudytb.pages.dev') ||
    host === 'gbstudykhangs.pages.dev' ||
    host.endsWith('.gbstudykhangs.pages.dev')
  ) {
    // Official Cloudflare Pages deployment
  } else if (host.endsWith('.run.app')) {
    if (!AUTHORIZED_HOST_TOKENS.some((tok) => host.includes(tok))) {
      return false;
    }
  } else if (host.endsWith('.ai.studio')) {
    if (!host.startsWith('gb-study')) {
      return false;
    }
  } else {
    return false;
  }

  try {
    if (window.self !== window.top && document.referrer) {
      const refHost = new URL(document.referrer).hostname.toLowerCase();
      const allowedRef =
        refHost === 'localhost' ||
        refHost === '127.0.0.1' ||
        refHost === 'gbstudytb.pages.dev' ||
        refHost.endsWith('.gbstudytb.pages.dev') ||
        refHost === 'gbstudykhangs.pages.dev' ||
        refHost.endsWith('.gbstudykhangs.pages.dev') ||
        refHost.endsWith('.google.com') ||
        refHost.endsWith('.scf.usercontent.goog') ||
        refHost.startsWith('gb-study') ||
        (refHost.endsWith('.run.app') && AUTHORIZED_HOST_TOKENS.some((tok) => refHost.includes(tok)));
      if (!allowedRef) {
        return false;
      }
    }
  } catch {
    return false;
  }

  return true;
}

export function getVerifiedDomBrand(): string {
  if (typeof document === 'undefined') return OFFICIAL_BRAND;

  const title = (document.title || '').trim();
  if (!title.startsWith(OFFICIAL_BRAND)) {
    return title || 'TAMPERED_TITLE';
  }

  const iconLinks = document.querySelectorAll('link[rel*="icon"]');
  if (iconLinks.length === 0) return 'MISSING_ICON';
  let hasOfficialIcon = false;
  iconLinks.forEach((link) => {
    const href = (link.getAttribute('href') || '').toLowerCase();
    if (href.includes('logo.png') || href.includes('favicon.ico')) {
      hasOfficialIcon = true;
    }
  });
  if (!hasOfficialIcon) {
    return 'TAMPERED_ICON';
  }

  const brandEls = document.querySelectorAll('[data-gb-brand]');
  for (let i = 0; i < brandEls.length; i++) {
    const txt = (brandEls[i].textContent || '').replace(/[•\s]+/g, ' ').trim();
    if (txt && txt.toUpperCase() !== OFFICIAL_BRAND) {
      return txt.toUpperCase();
    }
  }

  const bodyText = document.body?.innerText || '';
  if (bodyText) {
    const powered = bodyText.match(/Powered\s+by\s+([A-Za-z0-9_-]+\s+STUDY)/i);
    if (powered && powered[1].trim().toUpperCase() !== OFFICIAL_BRAND) {
      return powered[1].trim().toUpperCase();
    }
  }

  return OFFICIAL_BRAND;
}

export function isShieldIntact(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  if (!isAuthorizedHostAndFrame()) return false;
  if (getVerifiedDomBrand() !== OFFICIAL_BRAND) return false;
  if (cachedLogoShaVerified === false) return false;
  return true;
}

export async function verifyLogoAssetSha256(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return true;
  if (cachedLogoShaVerified !== null) return cachedLogoShaVerified;
  try {
    const res = await fetch('/logo.png', { cache: 'no-store' });
    if (!res.ok) {
      cachedLogoShaVerified = false;
      return false;
    }
    const buf = await res.arrayBuffer();
    const digest = await window.crypto.subtle.digest('SHA-256', buf);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    cachedLogoShaVerified = hex === OFFICIAL_LOGO_SHA256;
    return cachedLogoShaVerified;
  } catch {
    return true;
  }
}

export function deriveShieldSecret(): string {
  const domBrand = getVerifiedDomBrand();
  if (!isShieldIntact() || domBrand !== OFFICIAL_BRAND) {
    return `TAMPERED_${domBrand}_INVALID_KEY`;
  }
  return `${OFFICIAL_BRAND.replace(/\s+/g, '_')}_${OFFICIAL_LOGO_SHA256.slice(0, 16)}_SHIELD_2026_LOCK`;
}

export const CLEARANCE_STORAGE_KEY = 'gb_shield_clearance_v1';

export function getClearanceToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(CLEARANCE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setClearanceToken(token: string) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      sessionStorage.setItem(CLEARANCE_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(CLEARANCE_STORAGE_KEY);
    }
  } catch {
    // ignore storage limits
  }
}

export async function solvePowChallenge(nonce: string, difficulty = 2): Promise<string> {
  const targetPrefix = '0'.repeat(Math.max(1, Math.min(4, difficulty)));
  const encoder = new TextEncoder();
  for (let counter = 0; counter < 500000; counter++) {
    const candidate = counter.toString(36);
    const bytes = encoder.encode(`${nonce}:${candidate}`);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    const arr = new Uint8Array(digest);
    const hex = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    if (hex.startsWith(targetPrefix)) {
      return candidate;
    }
  }
  return '0';
}

export function signGbRequest(pathOnly: string, nonce: string): string {
  const combined = `${pathOnly}|${nonce}|${deriveShieldSecret()}`;
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

export function installAntiCopyGuards(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const isEditableTarget = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = (el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  const onSelectStart = (e: Event) => {
    if (!isEditableTarget(e.target)) {
      e.preventDefault();
    }
  };

  const onCopyOrCut = (e: ClipboardEvent) => {
    if (!isEditableTarget(e.target)) {
      e.preventDefault();
    }
  };

  const onDragStart = (e: DragEvent) => {
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const key = (e.key || '').toLowerCase();
    const hasCtrlOrMeta = e.ctrlKey || e.metaKey;

    if (
      key === 'f12' ||
      (hasCtrlOrMeta && e.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) ||
      (e.metaKey && e.altKey && ['i', 'j', 'c', 'u'].includes(key)) ||
      (hasCtrlOrMeta && ['u', 's', 'p'].includes(key)) ||
      (hasCtrlOrMeta && key === 'c' && !isEditableTarget(e.target))
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  window.addEventListener('contextmenu', onContextMenu, true);
  window.addEventListener('selectstart', onSelectStart, true);
  window.addEventListener('copy', onCopyOrCut, true);
  window.addEventListener('cut', onCopyOrCut, true);
  window.addEventListener('dragstart', onDragStart, true);
  window.addEventListener('keydown', onKeyDown, true);

  return () => {
    window.removeEventListener('contextmenu', onContextMenu, true);
    window.removeEventListener('selectstart', onSelectStart, true);
    window.removeEventListener('copy', onCopyOrCut, true);
    window.removeEventListener('cut', onCopyOrCut, true);
    window.removeEventListener('dragstart', onDragStart, true);
    window.removeEventListener('keydown', onKeyDown, true);
  };
}
