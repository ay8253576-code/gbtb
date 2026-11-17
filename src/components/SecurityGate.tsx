import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../lib/e2ee';
import {
  isShieldIntact,
  setClearanceToken,
  solvePowChallenge,
  verifyLogoAssetSha256,
} from '../lib/gbShield';

interface SecurityGateProps {
  onVerified: () => void;
}

export function SecurityGate({ onVerified }: SecurityGateProps) {
  const [phase, setPhase] = useState<'verifying' | 'verified' | 'error'>('verifying');
  const [errorText, setErrorText] = useState<string>('');
  const [rayId] = useState<string>(() => {
    try {
      const b = new Uint8Array(8);
      crypto.getRandomValues(b);
      return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    } catch {
      return '8f2c9a104e71b3d2';
    }
  });

  const runVerification = useCallback(async () => {
    setPhase('verifying');
    setErrorText('');
    const startedAt = Date.now();

    try {
      const [domOk, logoOk] = await Promise.all([
        Promise.resolve(isShieldIntact()),
        verifyLogoAssetSha256(),
      ]);

      if (!domOk || !logoOk) {
        setPhase('error');
        setErrorText('Unauthorized brand or icon modification detected.');
        return;
      }

      // Automated bot/headless heuristic check
      const isAutomated =
        typeof navigator !== 'undefined' &&
        (navigator.webdriver === true && !window.location.hostname.includes('localhost'));

      const chRes = await apiJson<{
        success?: boolean;
        nonce?: string;
        ts?: number;
        difficulty?: number;
        challengeSig?: string;
      }>('/api/v1/security/challenge', { cache: 'no-store' });

      if (!chRes.ok || !chRes.data?.nonce || !chRes.data?.challengeSig) {
        throw new Error('Security challenge unavailable');
      }

      const solution = await solvePowChallenge(
        chRes.data.nonce,
        chRes.data.difficulty || 2
      );

      const verifyRes = await apiJson<{
        success?: boolean;
        verified?: boolean;
        clearanceToken?: string;
        error?: string;
      }>('/api/v1/security/verify-human', {
        method: 'POST',
        body: {
          nonce: chRes.data.nonce,
          ts: chRes.data.ts,
          difficulty: chRes.data.difficulty || 2,
          challengeSig: chRes.data.challengeSig,
          solution,
          automatedFlag: isAutomated ? 1 : 0,
          tzOffset: new Date().getTimezoneOffset(),
          lang: navigator.language || 'en',
        },
      });

      if (!verifyRes.ok || !verifyRes.data?.verified || !verifyRes.data?.clearanceToken) {
        throw new Error(verifyRes.data?.error || 'Verification failed');
      }

      // Ensure crisp visual feedback matching the verification screen
      const elapsed = Date.now() - startedAt;
      if (elapsed < 950) {
        await new Promise((r) => setTimeout(r, 950 - elapsed));
      }

      setClearanceToken(verifyRes.data.clearanceToken);
      setPhase('verified');

      await new Promise((r) => setTimeout(r, 380));
      onVerified();
    } catch (err: any) {
      setPhase('error');
      setErrorText(err?.message || 'Security check could not be completed. Please retry.');
    }
  }, [onVerified]);

  useEffect(() => {
    void runVerification();
  }, [runVerification]);

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col justify-between px-6 py-10 sm:px-10 select-none">
      <div className="max-w-xl w-full mx-auto pt-6 sm:pt-14 space-y-6">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="GB STUDY"
            className="w-9 h-9 rounded-lg object-cover border border-slate-200 shadow-2xs shrink-0"
          />
          <span
            data-gb-brand="true"
            className="font-display font-bold text-xl sm:text-2xl tracking-tight text-slate-900"
          >
            GB STUDY
          </span>
        </div>

        <div className="space-y-2.5">
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-slate-900 leading-tight">
            Performing security verification
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-lg">
            This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot.
          </p>
        </div>

        {/* Bounded Verification Widget matching screenshot */}
        <div className="max-w-[360px] w-full rounded border border-slate-200 bg-[#fafafa] px-4 py-3.5 shadow-2xs flex items-center justify-between gap-4">
          {phase === 'verifying' && (
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 relative flex items-center justify-center shrink-0" aria-hidden="true">
                <svg className="w-7 h-7 animate-spin" viewBox="0 0 32 32">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, idx) => (
                    <circle
                      key={deg}
                      cx={16 + 11 * Math.cos((deg * Math.PI) / 180)}
                      cy={16 + 11 * Math.sin((deg * Math.PI) / 180)}
                      r="2.1"
                      fill="#0b875b"
                      opacity={0.2 + (idx / 8) * 0.8}
                    />
                  ))}
                </svg>
              </div>
              <span className="text-sm font-medium text-slate-700">Verifying...</span>
            </div>
          )}

          {phase === 'verified' && (
            <div className="flex items-center gap-2.5 text-[#0b875b]">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <span className="text-sm font-semibold">Success!</span>
            </div>
          )}

          {phase === 'error' && (
            <button
              type="button"
              onClick={() => void runVerification()}
              className="flex items-center gap-2 text-xs font-semibold text-red-600 hover:text-red-700 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>Retry Verification</span>
            </button>
          )}

          <div className="flex flex-col items-end shrink-0 text-right">
            <div className="flex items-center gap-1 text-slate-800 font-bold text-xs tracking-wide">
              <ShieldCheck className="w-4 h-4 text-[#00b862]" />
              <span>GB SHIELD</span>
            </div>
            <span className="text-[10px] text-slate-400">Bot Protection</span>
          </div>
        </div>

        {phase === 'error' && errorText && (
          <p className="text-xs font-medium text-red-600">{errorText}</p>
        )}
      </div>

      <footer className="max-w-xl w-full mx-auto pt-8 border-t border-slate-100 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <span>Ray ID: <span className="font-mono-num text-slate-500">{rayId}</span></span>
        <span>Cloud Security by <strong className="text-slate-600">GB SHIELD</strong></span>
      </footer>
    </div>
  );
}
