import {
  ArrowLeft,
  EllipsisVertical,
  FileText,
  KeyRound,
  ListVideo,
  RefreshCw,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiJson, getPlayerKey, initPlayerShieldGlobals } from '../lib/e2ee';
import { formatLectureDate } from '../lib/treeParser';
import { ParsedContentItem, VideoPlaybackContext } from '../types/study';

interface VideoPlayerModalProps {
  context: VideoPlaybackContext;
  authVersion: number;
  onClose: () => void;
  onSelectLecture: (lecture: ParsedContentItem) => void;
  onOpenPdf: (pdf: ParsedContentItem) => void;
  onRequireAuth: () => void;
}

export function VideoPlayerModal({
  context,
  authVersion,
  onClose,
  onSelectLecture,
  onOpenPdf,
  onRequireAuth,
}: VideoPlayerModalProps) {
  const { lecture, siblingLectures, relatedPdfs } = context;
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsActivation, setNeedsActivation] = useState(false);
  const [canActivateOnError, setCanActivateOnError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [iframeHudReady, setIframeHudReady] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onRequireAuthRef = useRef(onRequireAuth);
  const onCloseRef = useRef(onClose);
  const onOpenPdfRef = useRef(onOpenPdf);
  onRequireAuthRef.current = onRequireAuth;
  onCloseRef.current = onClose;
  onOpenPdfRef.current = onOpenPdf;

  useEffect(() => {
    initPlayerShieldGlobals();
  }, []);

  const triggerRetry = useCallback(() => {
    setShowMoreMenu(false);
    setIframeHudReady(false);
    setReloadTick((t) => t + 1);
  }, []);

  const sendIframeContext = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      {
        type: 'GB_PLAYER_CONTEXT',
        hasNotes: relatedPdfs.length > 0,
        hasPlaylist: siblingLectures.length > 1,
        title: lecture.title,
        isLive: !!lecture.isLive,
        isFullscreen: !!document.fullscreenElement,
      },
      '*'
    );
  }, [relatedPdfs.length, siblingLectures.length, lecture.title, lecture.isLive]);

  useEffect(() => {
    const onFsChange = () => {
      const win = iframeRef.current?.contentWindow;
      if (win) {
        win.postMessage(
          { type: 'GB_PLAYER_FS_STATE', isFullscreen: !!document.fullscreenElement },
          '*'
        );
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'USER_TRIGGER_AUTH') {
        setWatchUrl(null);
        setIframeHudReady(false);
        setNeedsActivation(true);
        onRequireAuthRef.current();
      } else if (d.type === 'GB_PLAYER_UI_READY') {
        setIframeHudReady(true);
        sendIframeContext();
      } else if (d.type === 'GB_PLAYER_BACK') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        onCloseRef.current();
      } else if (d.type === 'GB_PLAYER_RELOAD') {
        triggerRetry();
      } else if (d.type === 'GB_PLAYER_OPEN_NOTES') {
        if (relatedPdfs[0]) {
          onOpenPdfRef.current(relatedPdfs[0]);
        }
      } else if (d.type === 'GB_PLAYER_OPEN_PLAYLIST') {
        setShowPlaylist(true);
      } else if (d.type === 'GB_PLAYER_FULLSCREEN') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          const el = containerRef.current;
          el?.requestFullscreen?.().catch(() => {});
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [relatedPdfs, sendIframeContext, triggerRetry]);

  useEffect(() => {
    if (iframeHudReady) {
      sendIframeContext();
    }
  }, [iframeHudReady, sendIframeContext]);

  useEffect(() => {
    let cancelled = false;

    async function loadStream() {
      setLoading(true);
      setErrorMsg(null);
      setNeedsActivation(false);
      setCanActivateOnError(false);
      setWatchUrl(null);
      setIframeHudReady(false);

      initPlayerShieldGlobals();

      if (!lecture.assetId && !lecture.hlsUrl && !lecture.streamId && lecture.type !== 'stream') {
        setLoading(false);
        setErrorMsg('Video source ID is unavailable for this lecture.');
        return;
      }

      try {
        const res = await apiJson<{
          success?: boolean;
          watchUrl?: string;
          needsAuth?: boolean;
          authReason?: string;
          error?: string;
        }>('/api/v1/tb/create-stream-ticket', {
          method: 'POST',
          body: {
            assetId: lecture.assetId || '',
            streamId: lecture.streamId || lecture.id || '',
            courseId: context.courseId || '',
            title: lecture.title || '',
            token: '',
            isLive: !!lecture.isLive,
            hlsUrl: lecture.hlsUrl || '',
            playerKey: getPlayerKey(),
          },
        });

        if (cancelled) return;
        if (res.data?.watchUrl) {
          setWatchUrl(res.data.watchUrl);
          setLoading(false);
        } else if (res.data?.needsAuth) {
          if (res.data.authReason === 'upstream_offline_batch_locked') {
            setCanActivateOnError(true);
            setErrorMsg(
              res.data.error ||
                'मेन मीडिया सर्वर अभी उपलब्ध नहीं है। इस पेड बैच को चलाने के लिए संबंधित Target Board मोबाइल नंबर से OTP सत्यापन करें।'
            );
            setLoading(false);
          } else {
            setNeedsActivation(true);
            setLoading(false);
            onRequireAuthRef.current();
          }
        } else {
          setErrorMsg(res.data?.error || 'Unable to load lecture stream right now.');
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setErrorMsg('Network error while connecting to video stream.');
          setLoading(false);
        }
      }
    }

    loadStream();
    return () => {
      cancelled = true;
    };
  }, [lecture.id, lecture.streamId, lecture.assetId, lecture.hlsUrl, lecture.isLive, lecture.title, context.courseId, authVersion, reloadTick]);

  const showOuterHeader = !iframeHudReady || loading || !!errorMsg || needsActivation;

  return (
    <div
      ref={containerRef}
      style={{ touchAction: 'manipulation' }}
      className="fixed inset-0 z-50 h-[100dvh] min-h-[320px] w-full select-none overflow-hidden bg-black text-white flex flex-col"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Fallback Floating NextToppers top bar (auto-hidden once iframe HUD mounts) */}
      {showOuterHeader && (
      <header className="absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 pt-[max(16px,env(safe-area-inset-top))] lg:p-6 lg:pt-[max(24px,env(safe-area-inset-top))] pointer-events-none">
        <div className="flex items-center gap-3 min-w-0 pointer-events-auto">
          <button
            type="button"
            aria-label="Go back"
            title="Go back"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/45 backdrop-blur-sm text-white transition-transform duration-200 hover:scale-110 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 cursor-pointer"
          >
            <ArrowLeft className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.7} />
          </button>

          <div className="hidden sm:block max-w-md rounded-lg bg-black/45 px-3 py-1.5 backdrop-blur-sm">
            <p className="text-xs font-semibold text-white truncate">{lecture.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pointer-events-auto">
          {relatedPdfs.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenPdf(relatedPdfs[0])}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-[#23232a]/90 hover:bg-[#31313a] px-3 py-2 text-xs font-semibold text-white backdrop-blur-md transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#29ff94]" />
              <span>Notes</span>
            </button>
          )}

          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="More options"
              title="More options"
              onClick={() => setShowMoreMenu((prev) => !prev)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/45 backdrop-blur-sm text-white transition-transform duration-200 hover:scale-110 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 cursor-pointer"
            >
              <EllipsisVertical className="h-6 w-6" />
            </button>

            {showMoreMenu && (
              <div className="nt-player-menu absolute right-0 top-12 z-50 w-[min(270px,calc(100vw-24px))] rounded-lg bg-[#23232a]/95 p-1.5 shadow-2xl backdrop-blur-md space-y-1">
                <button
                  type="button"
                  onClick={triggerRetry}
                  className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-5 w-5" />
                  <span>Reload video</span>
                </button>

                {relatedPdfs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onOpenPdf(relatedPdfs[0]);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <FileText className="h-5 w-5 text-[#29ff94]" />
                    <span>Open Notes ({relatedPdfs.length})</span>
                  </button>
                )}

                {siblingLectures.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowPlaylist(true);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <ListVideo className="h-5 w-5 text-[#9387FF]" />
                    <span>Classes Playlist ({siblingLectures.length})</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      )}

      {/* Main Player Viewport */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {/* Exact NextToppers Spinner Ring while ticket loads */}
        {loading && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black px-4">
            <div className="flex flex-col items-center gap-4">
              <div
                className="h-8 w-8 animate-spin rounded-full border-[5px] border-[#3f3f3f] border-r-[#777] border-t-[#dedede]"
                aria-label="Loading video stream"
              />
              <span className="text-xs text-white/55 font-medium">Loading stream...</span>
            </div>
          </div>
        )}

        {/* OTP Activation Card */}
        {!loading && needsActivation && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-black px-5">
            <div className="max-w-sm w-full rounded-xl bg-[#17171c] border border-white/10 p-6 text-center space-y-3 shadow-2xl">
              <div className="w-12 h-12 rounded-xl bg-[#29ff94]/15 text-[#29ff94] mx-auto flex items-center justify-center">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="font-bold text-base text-white">
                One-Time Server Activation
              </h2>
              <p className="text-xs text-white/60 leading-relaxed">
                सर्वर पर 1 बार OTP सत्यापन करते ही यह लेक्चर सभी छात्रों के सभी डिवाइस पर बिना लॉगिन के चलने लगेगा।
              </p>
              <button
                type="button"
                onClick={onRequireAuth}
                className="w-full py-2.5 px-4 rounded-md bg-green-500 hover:bg-green-600 text-white text-sm font-semibold cursor-pointer transition-colors"
              >
                Activate with OTP
              </button>
            </div>
          </div>
        )}

        {/* Exact NextToppers Error Screen */}
        {!loading && errorMsg && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-black px-5">
            <div className="max-w-md text-center">
              <p className="text-base font-semibold text-white">Video unavailable</p>
              <p className="mt-2 text-sm text-white/65 leading-relaxed">{errorMsg}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 cursor-pointer transition-colors"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={triggerRetry}
                  className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 cursor-pointer transition-colors"
                >
                  Retry
                </button>
                {canActivateOnError && (
                  <button
                    type="button"
                    onClick={() => onRequireAuthRef.current()}
                    className="rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 cursor-pointer transition-colors"
                  >
                    Activate with OTP
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!loading && watchUrl && (
          <iframe
            ref={iframeRef}
            src={watchUrl}
            title={lecture.title}
            onLoad={sendIframeContext}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0 bg-black"
          />
        )}

        {/* Playlist Slide Panel */}
        {showPlaylist && (
          <div className="nt-player-menu absolute inset-y-0 right-0 w-80 max-w-[85vw] bg-[#17171c]/95 border-l border-white/10 backdrop-blur-md flex flex-col z-40">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="font-semibold text-sm text-white flex items-center gap-2">
                <ListVideo className="w-4 h-4 text-[#9387FF]" />
                <span>Classes ({siblingLectures.length})</span>
              </span>
              <button
                type="button"
                onClick={() => setShowPlaylist(false)}
                aria-label="Close playlist"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {siblingLectures.map((item, idx) => {
                const isCurrent = item.id === lecture.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectLecture(item);
                      setShowPlaylist(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-[#7567ee]/20 border-[#7567ee] text-white'
                        : 'bg-white/5 border-transparent text-white/80 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-[11px] text-white/55 font-mono-num">
                      #{idx + 1} · {formatLectureDate(item.createdAt)}
                    </div>
                    <div className="text-xs font-semibold line-clamp-2 mt-0.5">{item.title}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
