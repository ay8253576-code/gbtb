import { CheckCircle2, Info, ShieldAlert, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { BatchDetail } from './components/BatchDetail';
import { BatchesHome, HistoryEntry } from './components/BatchesHome';
import { Header, ThemeMode } from './components/Header';
import { LiveStreamsModal } from './components/LiveStreamsModal';
import { OtpAuthModal } from './components/OtpAuthModal';
import { PdfViewerModal } from './components/PdfViewerModal';
import { SecurityGate } from './components/SecurityGate';
import { NavSection, SideDrawer } from './components/SideDrawer';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import { CURATED_BATCHES, mergeBatchesList } from './lib/batchHelpers';
import { apiJson, initPlayerShieldGlobals } from './lib/e2ee';
import {
  getClearanceToken,
  installAntiCopyGuards,
  isShieldIntact,
  verifyLogoAssetSha256,
} from './lib/gbShield';
import {
  BatchItem,
  LiveStreamItem,
  ParsedContentItem,
  TreeFolderNode,
  VideoPlaybackContext,
} from './types/study';

const ENROLLMENTS_KEY = 'gbstudy_enrollments';
const LEGACY_ENROLLMENTS_KEYS = ['spidystudy_enrollments', 'targetboard_enrollments'];
const THEME_MODE_KEY = 'USER_THEME';
const LEGACY_THEME_KEY = 'gbstudy_theme';
const HISTORY_KEY = 'gbstudy_history';

function loadInitialEnrollments(): string[] {
  try {
    const raw =
      localStorage.getItem(ENROLLMENTS_KEY) ||
      LEGACY_ENROLLMENTS_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
    return raw ? JSON.parse(raw).map(String) : [];
  } catch {
    return [];
  }
}

function loadInitialThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_MODE_KEY);
    if (saved === 'LIGHT' || saved === 'DARK' || saved === 'SYSTEM') {
      return saved;
    }
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (legacy === 'dark') return 'DARK';
    if (legacy === 'light') return 'LIGHT';
    return 'SYSTEM';
  } catch {
    return 'SYSTEM';
  }
}

function loadInitialHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 30) : [];
  } catch {
    return [];
  }
}

function clearBrowserSessionPii() {
  try {
    localStorage.removeItem('tb_token');
    localStorage.removeItem('token');
    localStorage.removeItem('tb_user');
    localStorage.removeItem('tb_session_id');
    localStorage.removeItem('spidy_login_timestamp');
    sessionStorage.removeItem('gb_manual_logout');
  } catch {
    // ignore storage restrictions
  }
}

export default function App() {
  const [batches, setBatches] = useState<BatchItem[]>(CURATED_BATCHES);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [enrolledIds, setEnrolledIds] = useState<string[]>(loadInitialEnrollments);
  const [activeSection, setActiveSection] = useState<NavSection>('home');
  const [selectedBatch, setSelectedBatch] = useState<BatchItem | null>(null);
  const [folderStack, setFolderStack] = useState<TreeFolderNode[]>([]);

  const [liveStreams, setLiveStreams] = useState<LiveStreamItem[]>([]);
  const [activeVideo, setActiveVideo] = useState<VideoPlaybackContext | null>(null);
  const [activePdf, setActivePdf] = useState<ParsedContentItem | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>(loadInitialHistory);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get('login') === '1' || p.get('admin_login') === '1';
    } catch {
      return false;
    }
  });

  const [authVersion, setAuthVersion] = useState(0);
  const [loadingLive, setLoadingLive] = useState(false);
  const [securityTampered, setSecurityTampered] = useState<boolean>(() => !isShieldIntact());
  const [humanVerified, setHumanVerified] = useState<boolean>(() => !!getClearanceToken());

  const [themeMode, setThemeMode] = useState<ThemeMode>(loadInitialThemeMode);
  const [resolvedDark, setResolvedDark] = useState<boolean>(false);

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: 'success' | 'info' | 'error' = 'info') => {
      setToast({ message, type });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Sync Tailwind dark class on <html> supporting LIGHT / DARK / SYSTEM
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const isDark =
        themeMode === 'DARK' ? true : themeMode === 'LIGHT' ? false : mq.matches;
      root.classList.toggle('dark', isDark);
      setResolvedDark(isDark);
      try {
        localStorage.setItem(THEME_MODE_KEY, themeMode);
        localStorage.setItem(LEGACY_THEME_KEY, isDark ? 'dark' : 'light');
      } catch {
        // ignore
      }
    };

    apply();
    if (themeMode === 'SYSTEM') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [themeMode]);

  // Anti-copy, anti-inspect & continuous cryptographic brand/icon/domain integrity guard
  useEffect(() => {
    const cleanupCopyGuards = installAntiCopyGuards();
    let cancelled = false;

    const runIntegrityCheck = async () => {
      const domOk = isShieldIntact();
      const logoOk = await verifyLogoAssetSha256();
      if (!cancelled && (!domOk || !logoOk)) {
        setSecurityTampered(true);
      }
    };

    void runIntegrityCheck();

    const observer = new MutationObserver(() => {
      if (!isShieldIntact()) {
        setSecurityTampered(true);
      }
    });
    if (document.head) {
      observer.observe(document.head, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    }

    const timer = setInterval(() => {
      void runIntegrityCheck();
    }, 5000);

    const onRequireSecurityCheck = () => {
      setHumanVerified(false);
    };
    window.addEventListener('gb-require-security-check', onRequireSecurityCheck);

    return () => {
      cancelled = true;
      cleanupCopyGuards();
      observer.disconnect();
      clearInterval(timer);
      window.removeEventListener('gb-require-security-check', onRequireSecurityCheck);
    };
  }, []);

  // Capture any legacy local token cleanly to server shared session, then scrub PII from browser storage
  useEffect(() => {
    initPlayerShieldGlobals();
    if (!humanVerified) return;
    let cancelled = false;

    async function syncServerSession() {
      const existingToken = localStorage.getItem('tb_token') || localStorage.getItem('token') || '';
      const existingUserRaw = localStorage.getItem('tb_user');
      const hasValidLocalToken =
        existingToken.length > 20 && !existingToken.startsWith('tb_user_token_');

      if (hasValidLocalToken) {
        let parsedUser: any = null;
        try {
          parsedUser = existingUserRaw ? JSON.parse(existingUserRaw) : null;
        } catch {
          parsedUser = null;
        }
        try {
          await apiJson('/api/v1/tb/save-student-session', {
            method: 'POST',
            body: {
              token: existingToken,
              user: parsedUser,
              mobile: parsedUser?.mobile || '',
              sessionId: localStorage.getItem('tb_session_id') || '',
            },
          });
        } catch {
          // ignore upload retry
        }
      }

      clearBrowserSessionPii();

      try {
        const res = await apiJson<{ hasSession?: boolean; authenticated?: boolean }>(
          '/api/v1/tb/shared-session',
          { cache: 'no-store' }
        );
        if (!cancelled && res.ok && (res.data?.hasSession || res.data?.authenticated)) {
          setAuthVersion((v) => v + 1);
        }
      } catch {
        // ignore
      }
    }

    syncServerSession();
    return () => {
      cancelled = true;
    };
  }, [humanVerified]);

  const fetchLiveStreams = useCallback(async (force = false) => {
    setLoadingLive(true);
    try {
      const liveRes = await apiJson<{ activeStreams?: any[] }>(
        `/api/v1/tb/active-live-streams${force ? '?force=1' : ''}`,
        { cache: 'no-store' }
      );
      if (liveRes.ok && Array.isArray(liveRes.data?.activeStreams)) {
        setLiveStreams(
          liveRes.data.activeStreams.map((s: any, idx: number) => {
            const cId = s.courseId?._id || s.courseId || s.course?._id || s.course;
            return {
              id: String(s._id || s.id || s.streamId || idx),
              title: s.title || s.name || 'Live Class',
              courseId: cId ? String(cId) : undefined,
              courseIds: Array.isArray(s.courseIds)
                ? s.courseIds.map(String)
                : cId
                  ? [String(cId)]
                  : [],
              courseTitle: s.courseTitle || s.courseId?.title || s.course?.title,
              assetId: s.tpAssetId || s.assetId,
              hlsUrl: s.hlsUrl,
              bannerUrl:
                s.bannerUrl ||
                s.banner ||
                s.thumbnail ||
                s.poster ||
                s.image ||
                s.courseId?.thumbnail ||
                s.courseId?.courseImage ||
                s.course?.thumbnail ||
                s.course?.courseImage ||
                s.teacher?.profileImage ||
                s.teacher?.image,
              teacher:
                s.teacher?.fullName ||
                s.teacher?.name ||
                s.teacherName ||
                (typeof s.teacher === 'string' ? s.teacher : '') ||
                s.description ||
                '',
              startTime: s.startTime || s.scheduledStart || s.scheduledAt,
              status: s.status || 'LIVE',
            };
          })
        );
      }
    } catch {
      // ignore
    } finally {
      setLoadingLive(false);
    }
  }, []);

  // Load real batches.json and poll real active live streams every 30s
  useEffect(() => {
    if (!humanVerified) return;
    let cancelled = false;

    async function loadCatalog() {
      try {
        const res = await apiJson<{ new?: any[] }>(
          `/batches.json${authVersion > 0 ? '?force=1' : ''}`,
          { cache: 'no-store' }
        );
        if (!cancelled && res.ok && Array.isArray(res.data?.new) && res.data.new.length > 0) {
          setBatches(mergeBatchesList([], res.data.new));
        }
      } catch {
        // Keep curated list
      } finally {
        if (!cancelled) setLoadingBatches(false);
      }
    }

    loadCatalog();
    void fetchLiveStreams(authVersion > 0);

    const livePoll = setInterval(() => {
      void fetchLiveStreams(false);
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(livePoll);
    };
  }, [humanVerified, authVersion, fetchLiveStreams]);

  // Support deep link /?batch=<id>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const batchId = params.get('batch') || params.get('id');
    if (batchId && !selectedBatch) {
      const match = batches.find((b) => b.id.toLowerCase() === batchId.toLowerCase());
      if (match) {
        setSelectedBatch(match);
        setFolderStack([]);
      }
    }
  }, [batches, selectedBatch]);

  const recordHistory = useCallback((lecture: ParsedContentItem, batchTitle?: string) => {
    const entry: HistoryEntry = {
      id: lecture.id,
      title: lecture.title,
      batchTitle,
      thumbnailUrl: lecture.thumbnailUrl,
      watchedAt: Date.now(),
      lecture,
    };
    setHistoryEntries((prev) => {
      const next = [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 30);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleToggleEnroll = (batchId: string) => {
    setEnrolledIds((prev) => {
      const exists = prev.some((id) => id.toLowerCase() === batchId.toLowerCase());
      const next = exists
        ? prev.filter((id) => id.toLowerCase() !== batchId.toLowerCase())
        : [...prev, batchId];
      try {
        localStorage.setItem(ENROLLMENTS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      const batchTitle = batches.find((b) => b.id.toLowerCase() === batchId.toLowerCase())?.title;
      showToast(
        exists
          ? `Unenrolled${batchTitle ? ` from "${batchTitle}"` : ''}.`
          : `Successfully enrolled${batchTitle ? ` in "${batchTitle}"` : ''}!`,
        'success'
      );
      return next;
    });
  };

  const handleSelectBatch = (batch: BatchItem) => {
    setSelectedBatch(batch);
    setFolderStack([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePushFolder = (folder: TreeFolderNode) => {
    setFolderStack((prev) => [...prev, folder]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePopToIndex = (index: number) => {
    if (index < 0) {
      setFolderStack([]);
    } else {
      setFolderStack((prev) => prev.slice(0, index + 1));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (folderStack.length > 0) {
      setFolderStack((prev) => prev.slice(0, prev.length - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (selectedBatch) {
      setSelectedBatch(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (activeSection !== 'home') {
      setActiveSection('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleRequireAuth = useCallback(() => {
    setAuthModalOpen(true);
  }, []);

  if (securityTampered) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 select-none">
        <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-red-500/40 p-7 text-center shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30 mx-auto flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="font-bold text-xl text-red-400">
            मैं इस वेबसाइट का नाम और आइकन बदल नहीं सकती
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            यह वेबसाइट क्रिप्टोग्राफ़िक रूप से <strong>GB STUDY</strong> के मूल नाम, आधिकारिक आइकन (SHA-256) और अधिकृत सर्वर डोमेन से लॉक है। किसी दूसरे नाम, आइकन या दूसरे अकाउंट पर क्लोन करना स्थायी रूप से ब्लॉक है।
          </p>
        </div>
      </div>
    );
  }

  if (!humanVerified) {
    return <SecurityGate onVerified={() => setHumanVerified(true)} />;
  }

  const canGoBack = !!selectedBatch || activeSection !== 'home';

  return (
    <div className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground">
      <SideDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeSection={activeSection}
        enrolledCount={enrolledIds.length}
        liveCount={liveStreams.length}
        onSelectSection={(sec) => {
          setSelectedBatch(null);
          setFolderStack([]);
          setActiveSection(sec);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenLiveStreams={() => setLiveModalOpen(true)}
      />

      <div className="flex min-w-0 w-full max-w-full flex-1 flex-col xl:ml-64">
        <Header
          canGoBack={canGoBack}
          onBack={handleBack}
          onOpenDrawer={() => setDrawerOpen(true)}
          themeMode={themeMode}
          resolvedDark={resolvedDark}
          onChangeThemeMode={setThemeMode}
        />

        <main className="min-w-0 w-full max-w-full flex-1 overflow-x-hidden">
          {!selectedBatch ? (
            <BatchesHome
              batches={batches}
              loading={loadingBatches}
              enrolledIds={enrolledIds}
              activeSection={activeSection}
              liveStreams={liveStreams}
              historyEntries={historyEntries}
              onClearHistory={() => {
                setHistoryEntries([]);
                try {
                  localStorage.removeItem(HISTORY_KEY);
                } catch {
                  // ignore
                }
                showToast('Watch history cleared', 'info');
              }}
              onReplayHistory={(entry) =>
                setActiveVideo({
                  lecture: entry.lecture,
                  siblingLectures: [entry.lecture],
                  relatedPdfs: [],
                  courseId: entry.lecture.courseId,
                })
              }
              onToggleEnroll={handleToggleEnroll}
              onSelectBatch={handleSelectBatch}
              onOpenLiveStreams={() => setLiveModalOpen(true)}
              onResetToAll={() => {
                setSelectedBatch(null);
                setFolderStack([]);
                setActiveSection('home');
              }}
            />
          ) : (
            <BatchDetail
              batch={selectedBatch}
              authVersion={authVersion}
              folderStack={folderStack}
              onPushFolder={handlePushFolder}
              onPopToIndex={handlePopToIndex}
              liveStreams={liveStreams}
              onOpenVideo={(lecture, siblingLectures, relatedPdfs) => {
                recordHistory(lecture, selectedBatch.title);
                setActiveVideo({
                  lecture,
                  siblingLectures,
                  relatedPdfs,
                  courseId: selectedBatch.id,
                });
              }}
              onOpenPdf={(pdf) => setActivePdf(pdf)}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      <LiveStreamsModal
        isOpen={liveModalOpen}
        onClose={() => setLiveModalOpen(false)}
        streams={liveStreams}
        batches={batches}
        loading={loadingLive}
        onRefresh={() => void fetchLiveStreams(true)}
        onPlayStream={(item) => {
          recordHistory(item, 'Live / Scheduled Class');
          setActiveVideo({
            lecture: item,
            siblingLectures: [item],
            relatedPdfs: [],
            courseId: item.courseId,
          });
        }}
      />

      {activeVideo && (
        <VideoPlayerModal
          context={activeVideo}
          authVersion={authVersion}
          onClose={() => setActiveVideo(null)}
          onSelectLecture={(lecture) => {
            recordHistory(lecture, selectedBatch?.title);
            setActiveVideo((prev) => (prev ? { ...prev, lecture } : null));
          }}
          onOpenPdf={(pdf) => setActivePdf(pdf)}
          onRequireAuth={handleRequireAuth}
        />
      )}

      {activePdf && (
        <PdfViewerModal pdf={activePdf} onClose={() => setActivePdf(null)} />
      )}

      <OtpAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={() => {
          clearBrowserSessionPii();
          setAuthVersion((v) => v + 1);
        }}
        onToast={showToast}
      />

      {/* Top-right Sonner-style Toast Notification matching reference site */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="nt-toast-in fixed top-4 right-4 z-[90] flex items-center gap-2.5 rounded-lg border border-border bg-background px-4 py-3 text-xs sm:text-sm font-medium text-foreground shadow-lg max-w-[90vw]"
        >
          {toast.type === 'success' && (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          )}
          {toast.type === 'error' && (
            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          )}
          {toast.type === 'info' && (
            <Info className="h-4 w-4 text-[#5a4bda] dark:text-[#29ff94] shrink-0" />
          )}
          <span className="truncate">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
