import { CalendarClock, Clock, Play, Radio, RefreshCw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatClassSchedule } from '../lib/treeParser';
import { BatchItem, LiveStreamItem, ParsedContentItem } from '../types/study';

interface LiveStreamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  streams: LiveStreamItem[];
  batches?: BatchItem[];
  loading?: boolean;
  onRefresh?: () => void;
  onPlayStream: (item: ParsedContentItem) => void;
}

type LiveTab = 'all' | 'live' | 'upcoming';

export function LiveStreamsModal({
  isOpen,
  onClose,
  streams,
  batches = [],
  loading = false,
  onRefresh,
  onPlayStream,
}: LiveStreamsModalProps) {
  const [tab, setTab] = useState<LiveTab>('all');

  const batchThumbMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of batches) {
      if (b.id && b.thumbnail) m.set(String(b.id), b.thumbnail);
    }
    return m;
  }, [batches]);

  const { liveNow, upcoming, visibleStreams } = useMemo(() => {
    const liveList = streams.filter((s) => s.status !== 'UPCOMING');
    const upcomingList = streams
      .filter((s) => s.status === 'UPCOMING')
      .sort((a, b) => {
        const ta = a.startTime ? new Date(a.startTime).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b.startTime ? new Date(b.startTime).getTime() : Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
    const list = tab === 'live' ? liveList : tab === 'upcoming' ? upcomingList : [...liveList, ...upcomingList];
    return { liveNow: liveList, upcoming: upcomingList, visibleStreams: list };
  }, [streams, tab]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-card border border-border p-4 sm:p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-red-600 animate-pulse" />
            <h3 className="font-bold text-base text-card-foreground">
              Live &amp; Upcoming Classes
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                aria-label="Refresh live classes"
                className="px-2.5 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close live classes"
              className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Tabs: All / Live Now / Upcoming */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`px-3 py-2 rounded-md text-xs font-semibold border transition-colors cursor-pointer font-mono-num ${
              tab === 'all'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-muted/60 text-foreground border-border hover:bg-muted'
            }`}
          >
            All ({streams.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('live')}
            className={`px-3 py-2 rounded-md text-xs font-semibold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 font-mono-num ${
              tab === 'live'
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25 hover:bg-red-500/20'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            <span>Live Now ({liveNow.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('upcoming')}
            className={`px-3 py-2 rounded-md text-xs font-semibold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 font-mono-num ${
              tab === 'upcoming'
                ? 'bg-[#5a4bda] text-white border-[#5a4bda]'
                : 'bg-[#5a4bda]/10 text-[#5a4bda] dark:text-[#29ff94] border-[#5a4bda]/25 dark:border-[#29ff94]/25 hover:bg-[#5a4bda]/20'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            <span>Upcoming ({upcoming.length})</span>
          </button>
        </div>

        {visibleStreams.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {tab === 'live'
                ? 'No live broadcast running right now'
                : tab === 'upcoming'
                  ? 'No upcoming scheduled classes found'
                  : 'No live or scheduled classes right now'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Live and scheduled class timings from the main server automatically appear here. Check Upcoming tab or open any batch to study recorded classes &amp; notes.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-0.5">
            {visibleStreams.map((stream) => {
              const isUpcoming = stream.status === 'UPCOMING';
              const sched = formatClassSchedule(stream.startTime);
              const batchFallback =
                (stream.courseId && batchThumbMap.get(String(stream.courseId))) ||
                (stream.courseIds?.map((cid) => batchThumbMap.get(String(cid))).find(Boolean)) ||
                '/default-thumbnail.png';
              const thumbSrc = stream.bannerUrl || batchFallback;

              const handleOpen = () => {
                onClose();
                onPlayStream({
                  id: stream.id,
                  streamId: stream.id,
                  courseId: stream.courseId || stream.courseIds?.[0],
                  title: stream.title,
                  type: 'stream',
                  assetId: stream.assetId,
                  hlsUrl: stream.hlsUrl,
                  thumbnailUrl: thumbSrc,
                  isLive: !isUpcoming,
                });
              };

              return (
                <div
                  key={stream.id}
                  onClick={handleOpen}
                  className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-all hover:shadow-sm ${
                    isUpcoming
                      ? 'border-indigo-200/90 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-slate-800/60 hover:border-indigo-300'
                      : 'border-red-200/90 dark:border-red-900/50 bg-red-50/40 dark:bg-slate-800/60 hover:border-red-300'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <div className="relative w-28 sm:w-36 aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-200/80 dark:border-slate-700 shrink-0">
                      <img
                        src={thumbSrc}
                        alt={stream.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          if (img.dataset.fallbackStep === '2') return;
                          if (img.dataset.fallbackStep !== '1' && batchFallback !== '/default-thumbnail.png' && !img.src.endsWith(batchFallback)) {
                            img.dataset.fallbackStep = '1';
                            img.src = batchFallback;
                          } else {
                            img.dataset.fallbackStep = '2';
                            img.src = '/default-thumbnail.png';
                          }
                        }}
                        className="w-full h-full object-cover"
                      />
                      <span
                        className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-wide shadow ${
                          isUpcoming ? 'bg-amber-500 text-white' : 'bg-red-600 text-white'
                        }`}
                      >
                        {isUpcoming ? 'UPCOMING' : 'LIVE'}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                        <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200 font-mono-num">
                          <Clock className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                          {sched.dateTimeLabel}
                        </span>
                        {isUpcoming && sched.countdown && (
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold font-mono-num">
                            · {sched.countdown}
                          </span>
                        )}
                      </div>

                      <div className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2 leading-snug">
                        {stream.title}
                      </div>

                      {(stream.courseTitle || stream.teacher) && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {stream.courseTitle || stream.teacher}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpen();
                    }}
                    className={`w-full sm:w-auto px-4 py-2 rounded-lg text-white text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer ${
                      isUpcoming
                        ? 'bg-indigo-600 hover:bg-indigo-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isUpcoming ? 'Open' : 'Join'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
