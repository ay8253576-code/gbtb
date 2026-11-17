import {
  BookmarkPlus,
  CalendarCheck2,
  Clock,
  GraduationCap,
  History,
  PinOff,
  Play,
  Radio,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { getBatchAudienceMeta } from '../lib/batchHelpers';
import { formatClassSchedule } from '../lib/treeParser';
import { BatchItem, LiveStreamItem, ParsedContentItem } from '../types/study';
import { NavSection } from './SideDrawer';

export interface HistoryEntry {
  id: string;
  title: string;
  batchTitle?: string;
  thumbnailUrl?: string;
  watchedAt: number;
  lecture: ParsedContentItem;
}

interface BatchesHomeProps {
  batches: BatchItem[];
  loading: boolean;
  enrolledIds: string[];
  activeSection: NavSection;
  liveStreams: LiveStreamItem[];
  historyEntries: HistoryEntry[];
  onClearHistory: () => void;
  onReplayHistory: (entry: HistoryEntry) => void;
  onToggleEnroll: (batchId: string) => void;
  onSelectBatch: (batch: BatchItem) => void;
  onOpenLiveStreams: () => void;
  onResetToAll: () => void;
}

export function BatchesHome({
  batches,
  loading,
  enrolledIds,
  activeSection,
  liveStreams,
  historyEntries,
  onClearHistory,
  onReplayHistory,
  onToggleEnroll,
  onSelectBatch,
  onOpenLiveStreams,
  onResetToAll,
}: BatchesHomeProps) {
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(12);

  const filteredBatches = useMemo(() => {
    const enrolledSet = new Set(enrolledIds.map((id) => id.toLowerCase()));
    const q = (searchInput || appliedSearch).trim().toLowerCase();

    return batches.filter((b) => {
      if (activeSection === 'enrolled' && !enrolledSet.has(b.id.toLowerCase())) {
        return false;
      }
      if (q && !b.title.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [batches, enrolledIds, activeSection, searchInput, appliedSearch]);

  const displayedBatches = filteredBatches.slice(0, visibleLimit);
  const remainingCount = Math.max(0, filteredBatches.length - displayedBatches.length);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  };

  // History View
  if (activeSection === 'history') {
    return (
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Watch History</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Recently opened lectures &amp; live classes
            </p>
          </div>
          {historyEntries.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {historyEntries.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center divshadow space-y-3">
            <History className="mx-auto h-9 w-9 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">No watch history yet</p>
            <p className="text-xs text-muted-foreground">
              Open any batch and watch a lecture — it will appear here for quick resume.
            </p>
            <button
              type="button"
              onClick={onResetToAll}
              className="inline-flex items-center justify-center rounded-md bg-green-400 hover:bg-green-600 px-4 py-2 text-xs sm:text-sm font-medium text-white transition-colors cursor-pointer"
            >
              Explore Batches
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {historyEntries.map((entry) => (
              <article
                key={entry.id}
                className="overflow-hidden rounded-xl border border-border bg-card divshadow transition-shadow hover:shadow-lg flex flex-col justify-between"
              >
                <div
                  onClick={() => onReplayHistory(entry)}
                  className="relative aspect-video w-full overflow-hidden bg-muted/30 cursor-pointer"
                >
                  <img
                    src={entry.thumbnailUrl || '/default-thumbnail.png'}
                    alt={entry.title}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/default-thumbnail.png';
                    }}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 grid place-items-center bg-black/15">
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-black/65 text-white backdrop-blur-sm">
                      <Play className="h-6 w-6 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="line-clamp-2 text-sm font-semibold sm:text-base text-card-foreground">
                      {entry.title}
                    </h3>
                    {entry.batchTitle && (
                      <p className="mt-1 text-xs text-muted-foreground truncate">
                        {entry.batchTitle}
                      </p>
                    )}
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground font-mono-num">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {new Date(entry.watchedAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onReplayHistory(entry)}
                    className="w-full h-10 rounded-md bg-green-400 hover:bg-green-600 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Watch Again</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Study Overview Section (shows enrolled quick access + upcoming schedule)
  if (activeSection === 'study') {
    const enrolledBatches = batches.filter((b) =>
      enrolledIds.some((id) => id.toLowerCase() === b.id.toLowerCase())
    );
    const previewBatches = enrolledBatches.length > 0 ? enrolledBatches : batches.slice(0, 3);

    return (
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Study Dashboard</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Continue learning from your batches &amp; scheduled live classes
            </p>
          </div>
          <button
            type="button"
            onClick={onResetToAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#5a4bda] dark:text-[#29ff94]" />
            <span>Browse All Batches</span>
          </button>
        </div>

        {/* Live & Upcoming Strip */}
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5 divshadow space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-red-600 animate-pulse" />
              <h2 className="text-base sm:text-lg font-semibold text-card-foreground">
                Today&apos;s Live &amp; Upcoming Schedule
              </h2>
            </div>
            <button
              type="button"
              onClick={onOpenLiveStreams}
              className="rounded-md bg-green-400 hover:bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors cursor-pointer"
            >
              View All ({liveStreams.length})
            </button>
          </div>

          {liveStreams.length === 0 ? (
            <p className="text-xs sm:text-sm text-muted-foreground">
              No live or upcoming schedule fetched right now. Check any batch below for recorded lectures &amp; PDFs.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {liveStreams.slice(0, 6).map((stream) => {
                const isUpcoming = stream.status === 'UPCOMING';
                const sched = formatClassSchedule(stream.startTime);
                return (
                  <div
                    key={stream.id}
                    onClick={onOpenLiveStreams}
                    className="rounded-lg border border-border bg-background p-3 flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="relative w-24 aspect-video rounded-md overflow-hidden bg-muted shrink-0">
                      <img
                        src={stream.bannerUrl || '/default-thumbnail.png'}
                        alt={stream.title}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/default-thumbnail.png';
                        }}
                        className="w-full h-full object-cover"
                      />
                      <span
                        className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${
                          isUpcoming ? 'bg-gray-700' : 'bg-red-600'
                        }`}
                      >
                        {isUpcoming ? 'Upcoming' : 'LIVE'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground line-clamp-2">
                        {stream.title}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground font-mono-num truncate">
                        {sched.dateTimeLabel}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Quick Resume Batches */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            {enrolledBatches.length > 0 ? 'Your Enrolled Batches' : 'Recommended Batches'}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {previewBatches.map((batch) => {
              const isEnrolled = enrolledIds.some(
                (id) => id.toLowerCase() === batch.id.toLowerCase()
              );
              const meta = getBatchAudienceMeta(batch.title);
              return (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  meta={meta}
                  isEnrolled={isEnrolled}
                  onSelectBatch={onSelectBatch}
                  onToggleEnroll={onToggleEnroll}
                />
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  // Main Batches / My Batches Grid View matching /study/nexttoppers
  return (
    <div className="container mx-auto px-4 py-6">
      {/* Search Bar matching reference site */}
      <form
        onSubmit={handleSearchSubmit}
        className="divshadow mb-6 flex flex-wrap items-center gap-3 sm:gap-5"
      >
        <div className="relative w-full">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3">
            <Search strokeWidth={3} className="h-4 w-4 text-muted-foreground" />
          </div>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="divshadow block w-full rounded-md border border-input bg-foreground/10 p-4 ps-10 pr-24 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search Your Batch"
          />
          <button
            type="submit"
            className="absolute bottom-2.5 end-2.5 rounded-lg bg-green-400 hover:bg-green-500 px-4 py-2 text-sm font-medium text-white dark:bg-green-500 dark:hover:bg-green-600 transition-colors cursor-pointer"
          >
            Search
          </button>
        </div>
      </form>

      {/* Section Title when viewing My Batches */}
      {activeSection === 'enrolled' && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-foreground">
            My Batches ({filteredBatches.length})
          </h1>
          <button
            type="button"
            onClick={onResetToAll}
            className="text-xs font-semibold text-[#5a4bda] dark:text-[#29ff94] hover:underline cursor-pointer"
          >
            View All Batches
          </button>
        </div>
      )}

      {/* Skeleton Shimmer Placeholders */}
      {loading && batches.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <article
              key={n}
              aria-hidden="true"
              className="overflow-hidden rounded-xl border border-border bg-background p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="skeleton-shimmer h-5 w-3/5 rounded" />
                <div className="skeleton-shimmer h-6 w-12 rounded" />
              </div>
              <div className="skeleton-shimmer mt-4 aspect-video w-full rounded-lg" />
              <div className="mt-4 space-y-3">
                <div className="skeleton-shimmer h-4 w-2/5 rounded" />
                <div className="skeleton-shimmer h-4 w-4/5 rounded" />
                <div className="flex items-center justify-between gap-3">
                  <div className="skeleton-shimmer h-5 w-20 rounded" />
                  <div className="skeleton-shimmer h-5 w-28 rounded" />
                </div>
                <div className="flex gap-2 pt-1">
                  <div className="skeleton-shimmer h-10 flex-1 rounded-md" />
                  <div className="skeleton-shimmer h-10 flex-1 rounded-md" />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : displayedBatches.length === 0 ? (
        <div className="py-10 text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            {activeSection === 'enrolled'
              ? 'You are not enrolled in any batches yet.'
              : 'No batches found.'}
          </p>
          {activeSection === 'enrolled' && (
            <button
              type="button"
              onClick={onResetToAll}
              className="mt-2 inline-flex items-center justify-center rounded-md bg-green-400 hover:bg-green-600 px-4 py-2 text-xs font-medium text-white cursor-pointer transition-colors"
            >
              Browse All Batches
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {displayedBatches.map((batch) => {
              const isEnrolled = enrolledIds.some(
                (id) => id.toLowerCase() === batch.id.toLowerCase()
              );
              const meta = getBatchAudienceMeta(batch.title);
              return (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  meta={meta}
                  isEnrolled={isEnrolled}
                  onSelectBatch={onSelectBatch}
                  onToggleEnroll={onToggleEnroll}
                />
              );
            })}
          </div>

          <div className="mt-8 flex flex-col items-center gap-4 pb-4">
            {remainingCount > 0 && (
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 12)}
                className="rounded-md border border-input bg-background px-6 py-2.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
              >
                Load More ({remainingCount} left)
              </button>
            )}

            <p className="text-xs text-muted-foreground">
              Powered by{' '}
              <span
                data-gb-brand="true"
                className="font-semibold text-[#5a4bda] dark:text-[#29ff94]"
              >
                GB STUDY
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function BatchCard({
  batch,
  meta,
  isEnrolled,
  onSelectBatch,
  onToggleEnroll,
}: {
  batch: BatchItem;
  meta: { medium: string; audience: string; strikePrice: string };
  isEnrolled: boolean;
  onSelectBatch: (batch: BatchItem) => void;
  onToggleEnroll: (batchId: string) => void;
}) {
  return (
    <article className="flex flex-wrap overflow-hidden rounded-xl border border-border bg-white transition-shadow hover:shadow-lg dark:border-gray-700 dark:bg-gray-900">
      <div className="relative flex w-full items-center justify-between gap-4 p-4 pb-0">
        <h3
          onClick={() => onSelectBatch(batch)}
          title={batch.title}
          className="line-clamp-2 text-lg font-bold text-foreground cursor-pointer hover:text-[#5a4bda] dark:hover:text-[#29ff94] transition-colors"
        >
          {batch.title}
        </h3>
        <span className="!m-0 shrink-0 rounded bg-yellow-400 px-2 py-1 text-xs font-medium text-black">
          New
        </span>
      </div>

      <div className="flex w-full flex-wrap justify-between p-4">
        <div
          onClick={() => onSelectBatch(batch)}
          className="relative w-full overflow-hidden rounded-lg bg-muted/30 cursor-pointer"
        >
          <img
            src={batch.thumbnail || '/default-thumbnail.png'}
            alt={batch.title}
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/default-thumbnail.png';
            }}
            className="aspect-video w-full object-contain bg-muted/20"
          />
          <div className="absolute bottom-2 left-2 z-10">
            <span className="rounded-md bg-pink-500/70 px-2 py-1 text-xs font-medium text-white ring-1 ring-pink-700/10 ring-inset dark:bg-green-500/80">
              {meta.medium}
            </span>
          </div>
        </div>

        <div className="w-full space-y-3 pt-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserCheck className="h-4 w-4 shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate">
              {meta.audience}
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarCheck2 className="h-4 w-4 shrink-0" />
            <span>Valid till</span>
            <span className="font-semibold text-foreground">Session 2026-27</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-base font-bold text-green-600 sm:text-lg dark:text-green-400 font-mono-num">
                ₹ FREE
              </span>
              <span className="ml-2 text-xs text-muted-foreground line-through font-mono-num">
                {meta.strikePrice}
              </span>
            </div>
            <span className="rounded bg-green-50 px-2 py-1 text-xs text-green-600 dark:bg-green-500 dark:text-white">
              100% Free For Students
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSelectBatch(batch)}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 min-w-[120px] flex-1 cursor-pointer"
            >
              <GraduationCap className="mr-1 h-4 w-4" />
              <span>Study</span>
            </button>

            {isEnrolled ? (
              <button
                type="button"
                onClick={() => onToggleEnroll(batch.id)}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-10 px-4 py-2 min-w-[120px] flex-1 bg-red-600 text-xs text-white hover:bg-red-700 sm:text-sm cursor-pointer"
              >
                <PinOff className="h-4 w-4" />
                <span>Unenroll</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onToggleEnroll(batch.id)}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-10 px-4 py-2 min-w-[120px] flex-1 bg-green-400 text-xs text-white hover:bg-green-600 dark:hover:text-white sm:text-sm cursor-pointer"
              >
                <span>Enroll Now</span>
                <BookmarkPlus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
