import { KeyRound, Loader2, Lock, Phone, ShieldCheck, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiJson } from '../lib/e2ee';

interface OtpAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
  onToast: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export function OtpAuthModal({
  isOpen,
  onClose,
  onLoginSuccess,
  onToast,
}: OtpAuthModalProps) {
  const [step, setStep] = useState<'mobile' | 'otp' | 'register'>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('Patna');
  const [medium, setMedium] = useState<'Hindi' | 'English'>('Hindi');
  const [tempToken, setTempToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedMobileHint, setLockedMobileHint] = useState('');
  const [alreadyAuthenticated, setAlreadyAuthenticated] = useState(false);
  const [inlineStatus, setInlineStatus] = useState<{
    text: string;
    kind: 'success' | 'info' | 'error';
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    apiJson<{
      hasSession?: boolean;
      authenticated?: boolean;
      isLocked?: boolean;
      lockedMobileHint?: string;
    }>('/api/v1/tb/shared-session', { cache: 'no-store' })
      .then((res) => {
        if (cancelled || !res.ok) return;
        setIsLocked(!!res.data?.isLocked);
        setLockedMobileHint(String(res.data?.lockedMobileHint || ''));
        setAlreadyAuthenticated(!!(res.data?.hasSession || res.data?.authenticated));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  if (!isOpen) return null;

  const cleanMobile = mobile.replace(/[^0-9]/g, '').slice(-10);

  const handleSendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (cleanMobile.length !== 10) {
      const msg = 'कृपया 10 अंकों का सही मोबाइल नंबर दर्ज करें';
      setInlineStatus({ text: msg, kind: 'error' });
      onToast(msg, 'error');
      return;
    }
    setLoading(true);
    setInlineStatus(null);
    try {
      const res = await apiJson<{
        success?: boolean;
        alreadySent?: boolean;
        isLocked?: boolean;
        lockedMobileHint?: string;
        message?: string;
        error?: string;
      }>('/api/v1/tb-auth/send-otp', { method: 'POST', body: { mobile: cleanMobile } });

      if (res.data?.isLocked) {
        setIsLocked(true);
        if (res.data?.lockedMobileHint) setLockedMobileHint(res.data.lockedMobileHint);
      }

      if (!res.ok || res.data?.success === false) {
        throw new Error(res.data?.message || res.data?.error || 'OTP भेजने में त्रुटि हुई');
      }

      const msg =
        res.data?.message || 'OTP आपके मोबाइल पर SMS द्वारा भेज दिया गया है!';
      setStep('otp');
      setOtp('');
      setResendCooldown(60);
      setInlineStatus({
        text: msg,
        kind: res.data?.alreadySent ? 'info' : 'success',
      });
      onToast(msg, res.data?.alreadySent ? 'info' : 'success');
    } catch (err: any) {
      const msg = err?.message || 'OTP भेजने में त्रुटि हुई';
      setInlineStatus({ text: msg, kind: 'error' });
      onToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const finalizeSession = () => {
    onToast('लॉगिन सफल! यह नंबर अब हमेशा के लिए लॉक हो गया है।', 'success');
    onLoginSuccess();
    setStep('mobile');
    setInlineStatus(null);
    onClose();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.replace(/[^0-9]/g, '').trim();
    if (code.length !== 6) {
      const msg = 'कृपया 6 अंकों का सही OTP दर्ज करें';
      setInlineStatus({ text: msg, kind: 'error' });
      onToast(msg, 'error');
      return;
    }
    setLoading(true);
    setInlineStatus(null);
    try {
      const res = await apiJson<any>('/api/v1/tb-auth/verify-otp', {
        method: 'POST',
        body: { mobile: cleanMobile, code },
      });
      if (res.data?.isLocked) {
        setIsLocked(true);
        if (res.data?.lockedMobileHint) setLockedMobileHint(res.data.lockedMobileHint);
      }
      if (!res.ok || res.data?.success === false) {
        throw new Error(res.data?.message || res.data?.error || 'गलत OTP कोड। कृपया सही OTP दर्ज करें।');
      }
      if (res.data?.isNewUser && res.data?.tempToken) {
        setTempToken(res.data.tempToken);
        setStep('register');
        const msg = 'OTP सत्यापित! कृपया अपना नाम दर्ज करें।';
        setInlineStatus({ text: msg, kind: 'success' });
        onToast(msg, 'info');
        return;
      }
      finalizeSession();
    } catch (err: any) {
      const msg = err?.message || 'OTP सत्यापन असफल रहा';
      setInlineStatus({ text: msg, kind: 'error' });
      onToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      const msg = 'कृपया अपना पूरा नाम दर्ज करें';
      setInlineStatus({ text: msg, kind: 'error' });
      onToast(msg, 'error');
      return;
    }
    setLoading(true);
    setInlineStatus(null);
    try {
      const res = await apiJson<any>('/api/v1/tb-auth/complete-registration', {
        method: 'POST',
        body: {
          mobile: cleanMobile,
          fullName: fullName.trim(),
          stateBoardId: '6963925feefd2beed5d50f7b',
          mediumId: medium === 'Hindi' ? '696398c0eefd2beed5d51922' : '69639948eefd2beed5d51961',
          city: city.trim() || 'Patna',
          tempToken,
        },
      });
      if (!res.ok || res.data?.success === false) {
        throw new Error(res.data?.message || res.data?.error || 'पंजीकरण में त्रुटि हुई');
      }
      finalizeSession();
    } catch (err: any) {
      const msg = err?.message || 'पंजीकरण में त्रुटि हुई';
      setInlineStatus({ text: msg, kind: 'error' });
      onToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close login modal"
          className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-4">
          <div className="flex items-center gap-3 pr-8">
            <img
              src="/logo.png"
              alt="GB STUDY Logo"
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
            <div>
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                GB STUDY Official Access
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {step === 'mobile' && '10 अंकों का मोबाइल नंबर दर्ज करके OTP प्राप्त करें'}
                {step === 'otp' && `+91 ${cleanMobile} पर भेजा गया OTP दर्ज करें`}
                {step === 'register' && 'अपना प्रोफ़ाइल पूरा करें'}
              </p>
            </div>
          </div>

          {isLocked && lockedMobileHint && (
            <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium border bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
              {alreadyAuthenticated ? (
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Lock className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              )}
              <span>
                {alreadyAuthenticated
                  ? `स्थायी लॉगिन सक्रिय (${lockedMobileHint}) — पहली बार लॉगिन किए गए इसी नंबर से हमेशा लॉगिन रहेगा।`
                  : `स्थायी नंबर लॉक (${lockedMobileHint}) — यह वेबसाइट केवल पहले लॉगिन किए गए इसी नंबर से लॉगिन होगी।`}
              </span>
            </div>
          )}

          {inlineStatus && (
            <div
              className={`rounded-xl px-3.5 py-2.5 text-xs font-semibold border ${
                inlineStatus.kind === 'error'
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  : inlineStatus.kind === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              }`}
            >
              {inlineStatus.text}
            </div>
          )}

          {step === 'mobile' && (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {isLocked && lockedMobileHint
                    ? `स्थायी नंबर (${lockedMobileHint}) दर्ज करें`
                    : '10-Digit Mobile Number / मोबाइल नंबर'}
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 focus-within:border-[#00b862]">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder={
                      isLocked && lockedMobileHint ? `e.g. XXXXXX${lockedMobileHint.slice(-4)}` : 'e.g. 9876543210'
                    }
                    className="w-full bg-transparent text-sm text-slate-900 dark:text-white font-mono-num focus:outline-none"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || cleanMobile.length !== 10}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#00b862] hover:bg-[#00a357] disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>OTP प्राप्त करें (Get OTP)</span>
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    6-Digit SMS OTP
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('mobile');
                      setInlineStatus(null);
                    }}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Change Number
                  </button>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 focus-within:border-[#00b862]">
                  <KeyRound className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Enter 6-digit OTP"
                    className="w-full bg-transparent text-sm text-slate-900 dark:text-white font-mono-num tracking-widest focus:outline-none"
                  />
                </div>
                <div className="flex justify-end mt-1.5">
                  <button
                    type="button"
                    disabled={loading || resendCooldown > 0}
                    onClick={() => handleSendOtp()}
                    className="text-xs font-semibold text-[#00b862] disabled:text-slate-400 hover:underline cursor-pointer font-mono-num"
                  >
                    {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#00b862] hover:bg-[#00a357] disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>लॉगिन करें (Verify &amp; Login)</span>
              </button>
            </form>
          )}

          {step === 'register' && (
            <form onSubmit={handleCompleteRegistration} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name / पूरा नाम
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Medium
                  </label>
                  <select
                    value={medium}
                    onChange={(e) => setMedium(e.target.value as 'Hindi' | 'English')}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="Hindi">Hindi</option>
                    <option value="English">English</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#00b862] hover:bg-[#00a357] disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Complete Registration</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
