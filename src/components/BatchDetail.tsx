import {
  Atom,
  BookOpen,
  Calculator,
  ChevronRight,
  Clock,
  Dna,
  Download,
  FileText,
  FlaskConical,
  FolderOpen,
  Globe,
  Megaphone,
  Play,
  Share2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/e2ee';
import {
  buildSyllabusTree,
  collectAllFromFolder,
  formatClassSchedule,
  formatLectureDate,
} from '../lib/treeParser';
import {
  BatchItem,
  LiveStreamItem,
  ParsedContentItem,
  TreeFolderNode,
} from '../types/study';

interface BatchDetailProps {
  batch: BatchItem;
  authVersion: number;
  folderStack: TreeFolderNode[];
  onPushFolder: (folder: TreeFolderNode) => void;
  onPopToIndex: (index: number) => void;
  liveStreams: LiveStreamItem[];
  onOpenVideo: (
    lecture: ParsedContentItem,
    siblingLectures: ParsedContentItem[],
    relatedPdfs: ParsedContentItem[]
  ) => void;
  onOpenPdf: (pdf: ParsedContentItem) => void;
  onToast: (message: string, type?: 'success' | 'info' | 'error') => void;
}

type SectionTab = 'content' | 'live' | 'all_notes' | 'overview';
type ContentFilterTab = 'all' | 'lectures' | 'notes';

const treeCache = new Map<string, TreeFolderNode[]>();

function getSubjectStyle(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('physics') || lower.includes('भौतिकी')) {
    return { Icon: Atom, bg: 'bg-[#7567ee]/10 text-[#5a4bda] dark:bg-[#3dc280]/10 dark:text-[#29ff94]' };
  }
  if (lower.includes('chem') || lower.includes('रसायन')) {
    return { Icon: FlaskConical, bg: 'bg-[#7567ee]/10 text-[#5a4bda] dark:bg-[#3dc280]/10 dark:text-[#29ff94]' };
  }
  if (lower.includes('bio') || lower.includes('botany') || lower.includes('zoology') || lower.includes('जीव')) {
    return { Icon: Dna, bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  }
  if (lower.includes('math') || lower.includes('गणित')) {
    return { Icon: Calculator, bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' };
  }
  if (lower.includes('social') || lower.includes('history') || lower.includes('geo') || lower.includes('सामाजिक')) {
    return { Icon: Globe, bg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' };
  }
  if (lower.includes('notice') || lower.includes('special') || lower.includes('youtube')) {
    return { Icon: Megaphone, bg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' };
  }
  if (lower.includes('note') || lower.includes('pdf') || lower.includes('topper')) {
    return { Icon: FileText, bg: 'bg-[#7567ee]/10 text-[#5a4bda] dark:bg-[#3dc280]/10 dark:text-[#29ff94]' };
  }
  return { Icon: BookOpen, bg: 'bg-[#7567ee]/10 text-[#5a4bda] dark:bg-[#3dc280]/10 dark:text-[#29ff94]' };
}

export function BatchDetail({
  batch,
  authVersion,
  folderStack,
  onPushFolder,
  onPopToIndex,
  liveStreams,
  onOpenVideo,
  onOpenPdf,
  onToast,
}: BatchDetailProps) {
  const cacheKey = `${batch.id}:${authVersion}`;
  const [rootFolders, setRootFolders] = useState<TreeFolderNode[]>(
    () => treeCache.get(cacheKey) || treeCache.get(batch.id) || []
  );
  const [loading, setLoading] = useState<boolean>(
    () => !treeCache.has(cacheKey) && !treeCache.has(batch.id)
  );
  const [sectionTab, setSectionTab] = useState<SectionTab>('content');
  const [contentFilter, setContentFilter] = useState<ContentFilterTab>('all');

  useEffect(() => {
    let cancelled = false;
    async function loadSyllabus() {
      if (!treeCache.has(cacheKey) && !treeCache.has(batch.id)) {
        setLoading(true);
      }
      try {
        const res = await apiJson<any[]>(`/api/v1/category/tree-user/${batch.id}/v2`);
        if (!cancelled && res.ok && Array.isArray(res.data)) {
          const parsed = buildSyllabusTree(res.data);
          treeCache.set(cacheKey, parsed);
          treeCache.set(batch.id, parsed);
          setRootFolders(parsed);
          setLoading(false);
          return;
        }
      } catch {
        // Fallback to Vidyapeeth endpoint if applicable
      }

      if (batch.isVgCourse || batch.provider === 'vidyapeeth') {
        try {
          const vgRes = await apiJson<any>(
            `/vg/get/folder_contentsv3?course_id=${batch.id}&parent_id=-1&start=0`
          );
          if (!cancelled && vgRes.ok && Array.isArray(vgRes.data?.data)) {
            const parsed = buildSyllabusTree(vgRes.data.data);
            treeCache.set(cacheKey, parsed);
            treeCache.set(batch.id, parsed);
            setRootFolders(parsed);
          }
        } catch {
          // ignore
        }
      }

      if (!cancelled) setLoading(false);
    }

    loadSyllabus();
    return () => {
      cancelled = true;
    };
  }, [batch.id, batch.isVgCourse, batch.provider, authVersion, cacheKey]);

  const currentFolder = folderStack.length > 0 ? folderStack[folderStack.length - 1] : null;
  useEffect(() => {
    setContentFilter('all');
  }, [currentFolder?.id]);

  const batchSummary = useMemo(() => {
    let videos: ParsedContentItem[] = [];
    let pdfs: ParsedContentItem[] = [];
    for (const f of rootFolders) {
      const sub = collectAllFromFolder(f);
      videos = videos.concat(sub.videos);
      pdfs = pdfs.concat(sub.pdfs);
    }
    return { videos, pdfs };
  }, [rootFolders]);

  const batchLiveStreams = useMemo(() => {
    const byId = new Map<string, LiveStreamItem>();
    const targetId = String(batch.id);
    const matchingGlobal = liveStreams.filter(
      (s) =>
        (s.courseId && String(s.courseId) === targetId) ||
        (Array.isArray(s.courseIds) && s.courseIds.map(String).includes(targetId))
    );
    for (const s of matchingGlobal) {
      byId.set(s.id, s);
    }

    const now = Date.now();
    for (const v of batchSummary.videos) {
      const stLower = String(v.status || '').toLowerCase();
      const tpUpper = String(v.status || '').toUpperCase();
      const isLiveNow = v.isLive || stLower === 'live' || tpUpper === 'STREAMING';
      const isScheduled =
        !isLiveNow &&
        (stLower === 'scheduled' || stLower === 'upcoming' || tpUpper === 'NOT_STARTED') &&
        (!v.createdAt || new Date(v.createdAt).getTime() >= now - 12 * 3600 * 1000);

      if (isLiveNow || isScheduled) {
        const key = v.streamId || v.id;
        if (!byId.has(key)) {
          byId.set(key, {
            id: key,
            title: v.title,
            courseId: batch.id,
            courseTitle: batch.title,
            assetId: v.assetId,
            hlsUrl: v.hlsUrl,
            bannerUrl: v.thumbnailUrl || batch.thumbnail,
            teacher: v.description,
            startTime: v.createdAt,
            status: isLiveNow ? 'LIVE' : 'UPCOMING',
          });
        }
      }
    }

    return Array.from(byId.values()).sort((a, b) => {
      const aLive = a.status !== 'UPCOMING' ? 0 : 1;
      const bLive = b.status !== 'UPCOMING' ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
      const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
      return aLive === 0 ? tb - ta : ta - tb;
    });
  }, [liveStreams, batch.id, batch.title, batch.thumbnail, batchSummary.videos]);

  const displayedFolders = currentFolder ? currentFolder.children : rootFolders;
  const displayedVideos = currentFolder ? currentFolder.videos : [];
  const displayedPdfs = currentFolder ? currentFolder.pdfs : [];

  const handleShareBatch = async () => {
    const shareUrl = `${window.location.origin}/?batch=${batch.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      onToast('Batch link copied to clipboard', 'success');
    } catch {
      onToast('Share link ready: ' + batch.title, 'info');
    }
  };

  const handleDownloadPdf = async (pdf: ParsedContentItem) => {
    if (!pdf.pdfUrl) return;
    const url = pdf.pdfUrl.startsWith('/')
      ? pdf.pdfUrl
      : pdf.pdfUrl.startsWith('http://') || pdf.pdfUrl.startsWith('https://')
        ? `/api/v1/pdf-proxy?url=${encodeURIComponent(pdf.pdfUrl)}`
        : `/api/v1/secure/doc/${encodeURIComponent(pdf.pdfUrl)}`;
    try {
      onToast('Preparing PDF download...', 'info');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = pdf.fileName || `${pdf.title.replace(/[^\w\s-]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 2500);
    } catch {
      onToast('Unable to download PDF right now.', 'error');
    }
  };

  const folderHeading =
    folderStack.length === 0 ? 'Subjects' : folderStack.length === 1 ? 'Chapters' : 'Topics';

  return (
    <div className="min-w-0 w-full max-w-full overflow-x-hidden px-3 py-5 sm:p-5">
      {/* Top Rounded Purple Header Banner & Underlined Tab Bar matching 5299 */}
      <div className="rounded-[20px_20px_0_0] border border-border bg-background">
        <div className="overflow-hidden rounded-[20px_20px_0_0]">
          <div className="container mx-auto bg-[#7363FC] bg-[url(/assets/descriptionHeader.svg)] bg-cover bg-center bg-no-repeat px-4 py-6">
            {loading && !batch.title ? (
              <div className="skeleton-shimmer h-8 w-64 max-w-full rounded bg-white/20" />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 p-1 sm:p-2">
                <h1 className="text-xl font-bold text-white sm:text-2xl">
                  {batch.title}
                </h1>
                <button
                  type="button"
                  onClick={handleShareBatch}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors cursor-pointer shrink-0"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Share Batch</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Horizontal Tab Strip */}
        <div className="flex min-w-0 w-full items-center px-0 divshadow">
          <div className="mx-3 flex min-w-0 max-w-full gap-5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setSectionTab('content')}
              className={`w-auto whitespace-nowrap border-b-4 px-1 py-3 text-xs font-medium transition-all cursor-pointer ${
                sectionTab === 'content'
                  ? 'rounded border-[#7567ee] text-[#5a4bda] dark:border-[#3dc280] dark:text-[#29ff94]'
                  : 'border-transparent text-foreground hover:text-[#7567ee] dark:hover:text-[#29ff94]'
              }`}
            >
              🎁 Content
            </button>

            <button
              type="button"
              onClick={() => setSectionTab('live')}
              className={`w-auto whitespace-nowrap border-b-4 px-1 py-3 text-xs font-medium transition-all cursor-pointer ${
                sectionTab === 'live'
                  ? 'rounded border-[#7567ee] text-[#5a4bda] dark:border-[#3dc280] dark:text-[#29ff94]'
                  : 'border-transparent text-foreground hover:text-[#7567ee] dark:hover:text-[#29ff94]'
              }`}
            >
              🔴 Live ({batchLiveStreams.length})
            </button>

            <button
              type="button"
              onClick={() => setSectionTab('all_notes')}
              className={`w-auto whitespace-nowrap border-b-4 px-1 py-3 text-xs font-medium transition-all cursor-pointer ${
                sectionTab === 'all_notes'
                  ? 'rounded border-[#7567ee] text-[#5a4bda] dark:border-[#3dc280] dark:text-[#29ff94]'
                  : 'border-transparent text-foreground hover:text-[#7567ee] dark:hover:text-[#29ff94]'
              }`}
            >
              📄 All Notes ({batchSummary.pdfs.length})
            </button>

            <button
              type="button"
              onClick={() => setSectionTab('overview')}
              className={`w-auto whitespace-nowrap border-b-4 px-1 py-3 text-xs font-medium transition-all cursor-pointer ${
                sectionTab === 'overview'
                  ? 'rounded border-[#7567ee] text-[#5a4bda] dark:border-[#3dc280] dark:text-[#29ff94]'
                  : 'border-transparent text-foreground hover:text-[#7567ee] dark:hover:text-[#29ff94]'
              }`}
            >
              Description
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <div className="container mx-auto min-w-0 max-w-full px-0 py-6">
        {/* Clickable Breadcrumbs matching 5299 */}
        {sectionTab === 'content' && folderStack.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
            <button
              type="button"
              onClick={() => onPopToIndex(-1)}
              className="text-[#5a4bda] hover:underline dark:text-[#29ff94] cursor-pointer"
            >
              Content
            </button>
            {folderStack.map((folder, idx) => (
              <div key={folder.id} className="flex items-center gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => onPopToIndex(idx)}
                  className={
                    idx === folderStack.length - 1
                      ? 'font-semibold text-foreground cursor-default'
                      : 'text-[#5a4bda] hover:underline dark:text-[#29ff94] cursor-pointer'
                  }
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* CONTENT TAB */}
        {sectionTab === 'content' && (
          loading && rootFolders.length === 0 ? (
            <div className="rounded-xl border border-border bg-background p-4 divshadow sm:p-6">
              <div className="skeleton-shimmer mb-4 h-6 w-36 rounded" />
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="divshadow flex items-center gap-3 rounded-lg border border-border bg-background p-3 sm:p-4"
                  >
                    <div className="skeleton-shimmer h-10 w-10 rounded-md shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="skeleton-shimmer h-4 w-4/5 rounded" />
                      <div className="skeleton-shimmer h-3 w-2/5 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Folders (Subjects / Chapters / Topics) */}
              {displayedFolders.length > 0 && (
                <section className="rounded-xl border border-border bg-background p-4 divshadow sm:p-6">
                  <h2 className="mb-4 text-lg font-semibold text-foreground sm:text-xl">
                    {folderHeading}
                  </h2>

                  <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
                    {displayedFolders.map((folder) => {
                      const { Icon, bg } = getSubjectStyle(folder.name);
                      const hasChildren = folder.children.length > 0;
                      const subtitle = hasChildren
                        ? `${folder.children.length} Chapters${
                            folder.totalVideos > 0 ? ` • ${folder.totalVideos} Videos` : ''
                          }`
                        : `${folder.totalVideos} Videos${
                            folder.totalNotes > 0 ? ` • ${folder.totalNotes} Notes` : ''
                          }`;

                      return (
                        <div
                          key={folder.id}
                          onClick={() => onPushFolder(folder)}
                          className="divshadow flex min-w-0 w-full cursor-pointer items-center gap-3 overflow-hidden rounded-lg border border-border bg-background p-3 transition-shadow hover:shadow-md sm:p-4"
                        >
                          <div
                            className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${bg}`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="min-w-0 max-w-full overflow-hidden">
                              <p className="block w-full truncate text-sm font-semibold text-foreground sm:text-base">
                                {folder.name}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono-num truncate">
                              {subtitle}
                            </p>
                          </div>

                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Direct Videos & PDFs inside current folder */}
              {(displayedVideos.length > 0 || displayedPdfs.length > 0) && (
                <section className="rounded-xl border border-border bg-background p-4 divshadow sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                    <h2 className="text-lg font-semibold text-foreground">Content</h2>
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                      <button
                        type="button"
                        onClick={() => setContentFilter('all')}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                          contentFilter === 'all'
                            ? 'bg-foreground text-background'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        All ({displayedVideos.length + displayedPdfs.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setContentFilter('lectures')}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                          contentFilter === 'lectures'
                            ? 'bg-foreground text-background'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Lectures ({displayedVideos.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setContentFilter('notes')}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                          contentFilter === 'notes'
                            ? 'bg-foreground text-background'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Notes ({displayedPdfs.length})
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {(contentFilter === 'all' || contentFilter === 'lectures') &&
                      displayedVideos.map((lec) => {
                        const dateLabel = formatLectureDate(lec.createdAt);
                        const thumb = lec.thumbnailUrl || batch.thumbnail || '/default-thumbnail.png';
                        return (
                          <article
                            key={lec.id}
                            className="overflow-hidden rounded-xl border border-border bg-background divshadow transition hover:shadow-md flex flex-col justify-between"
                          >
                            <div
                              onClick={() => onOpenVideo(lec, displayedVideos, displayedPdfs)}
                              className="relative aspect-video w-full overflow-hidden bg-muted/40 cursor-pointer"
                            >
                              <img
                                src={thumb}
                                alt={lec.title}
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src =
                                    batch.thumbnail || '/default-thumbnail.png';
                                }}
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute inset-0 grid place-items-center bg-black/15">
                                <div className="grid h-12 w-12 place-items-center rounded-full bg-black/65 text-white backdrop-blur-sm transition-transform hover:scale-105">
                                  <Play className="h-6 w-6 fill-current ml-0.5" />
                                </div>
                              </div>
                            </div>

                            <div className="p-4 flex-1 flex flex-col justify-between">
                              <div>
                                <h3
                                  onClick={() => onOpenVideo(lec, displayedVideos, displayedPdfs)}
                                  className="line-clamp-2 text-sm font-semibold text-foreground sm:text-base cursor-pointer hover:text-[#5a4bda] dark:hover:text-[#29ff94]"
                                >
                                  {lec.title}
                                </h3>
                                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground font-mono-num">
                                  <Clock className="h-3.5 w-3.5 shrink-0" />
                                  <span>{lec.durationText || dateLabel}</span>
                                </p>
                              </div>

                              <div className="mt-4 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => onOpenVideo(lec, displayedVideos, displayedPdfs)}
                                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-green-400 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 transition-colors cursor-pointer"
                                >
                                  <Play className="h-4 w-4 fill-current" />
                                  <span>Watch</span>
                                </button>
                                {displayedPdfs.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenPdf(displayedPdfs[0])}
                                    title="Open related class notes"
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer shrink-0"
                                  >
                                    <FileText className="h-4 w-4 text-[#5a4bda] dark:text-[#29ff94]" />
                                    <span>Notes</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}

                    {(contentFilter === 'all' || contentFilter === 'notes') &&
                      displayedPdfs.map((pdf) => (
                        <NoteCard
                          key={pdf.id}
                          pdf={pdf}
                          onOpenPdf={onOpenPdf}
                          onDownloadPdf={handleDownloadPdf}
                        />
                      ))}
                  </div>
                </section>
              )}

              {displayedFolders.length === 0 &&
                displayedVideos.length === 0 &&
                displayedPdfs.length === 0 && (
                  <EmptyStateCard message="No content available here yet." />
                )}
            </div>
          )
        )}

        {/* LIVE TAB */}
        {sectionTab === 'live' && (
          batchLiveStreams.length === 0 ? (
            <EmptyStateCard message="No live or upcoming classes scheduled in this batch right now." />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {batchLiveStreams.map((stream) => {
                const isUpcoming = stream.status === 'UPCOMING';
                const sched = formatClassSchedule(stream.startTime);
                const fallbackThumb = batch.thumbnail || '/default-thumbnail.png';
                const thumbSrc = stream.bannerUrl || fallbackThumb;

                const openStream = () =>
                  onOpenVideo(
                    {
                      id: stream.id,
                      streamId: stream.id,
                      title: stream.title,
                      type: 'stream',
                      assetId: stream.assetId,
                      hlsUrl: stream.hlsUrl,
                      thumbnailUrl: thumbSrc,
                      isLive: !isUpcoming,
                    },
                    [],
                    []
                  );

                return (
                  <article
                    key={stream.id}
                    className="overflow-hidden rounded-xl border border-border bg-background divshadow transition hover:shadow-md flex flex-col justify-between"
                  >
                    <div
                      onClick={openStream}
                      className="relative aspect-video overflow-hidden bg-muted/40 cursor-pointer"
                    >
                      <img
                        src={thumbSrc}
                        alt={stream.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          if (img.dataset.fallbackStep === '2') return;
                          if (
                            img.dataset.fallbackStep !== '1' &&
                            fallbackThumb !== '/default-thumbnail.png' &&
                            !img.src.endsWith(fallbackThumb)
                          ) {
                            img.dataset.fallbackStep = '1';
                            img.src = fallbackThumb;
                          } else {
                            img.dataset.fallbackStep = '2';
                            img.src = '/default-thumbnail.png';
                          }
                        }}
                        className="h-full w-full object-cover"
                      />
                      <span
                        className={`absolute left-2 top-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white shadow ${
                          isUpcoming ? 'bg-gray-600' : 'bg-red-600'
                        }`}
                      >
                        {isUpcoming ? 'Upcoming' : 'LIVE'}
                      </span>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
                          {stream.title}
                        </h3>
                        <p className="mt-2 text-xs text-muted-foreground font-mono-num">
                          {sched.dateTimeLabel}
                          {isUpcoming && sched.countdown ? ` · ${sched.countdown}` : ''}
                        </p>
                      </div>

                      {!isUpcoming ? (
                        <button
                          type="button"
                          onClick={openStream}
                          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-green-400 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 transition-colors cursor-pointer"
                        >
                          <Play className="h-4 w-4 fill-current" />
                          <span>Watch Live</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={openStream}
                          className="mt-4 w-full rounded-md bg-muted hover:bg-muted/80 px-4 py-2 text-center text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-mono-num"
                        >
                          {sched.countdown || sched.dateTimeLabel} · Open Class
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )
        )}

        {/* ALL NOTES TAB */}
        {sectionTab === 'all_notes' && (
          batchSummary.pdfs.length === 0 ? (
            <EmptyStateCard message="No PDF notes available in this batch yet." />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {batchSummary.pdfs.map((pdf) => (
                <NoteCard
                  key={pdf.id}
                  pdf={pdf}
                  onOpenPdf={onOpenPdf}
                  onDownloadPdf={handleDownloadPdf}
                />
              ))}
            </div>
          )
        )}

        {/* DESCRIPTION / OVERVIEW TAB */}
        {sectionTab === 'overview' && (
          <div className="rounded-xl border border-border bg-background p-4 text-sm leading-7 divshadow sm:p-6 space-y-4">
            <h3 className="text-base font-bold text-foreground">{batch.title}</h3>
            <p className="text-muted-foreground">
              Welcome to <strong>{batch.title}</strong> on{' '}
              <span data-gb-brand="true" className="font-semibold text-foreground">
                GB STUDY
              </span>
              . All chapter lectures, live classes, scheduled sessions, and downloadable PDF notes are available inside the Content tab.
            </p>
            <div className="flex flex-wrap gap-3 pt-2 border-t border-border text-xs font-mono-num text-muted-foreground">
              <span className="rounded-md bg-muted px-3 py-1.5 text-foreground font-semibold">
                {rootFolders.length} Subjects
              </span>
              <span className="rounded-md bg-muted px-3 py-1.5 text-foreground font-semibold">
                {batchSummary.videos.length} Video Lectures
              </span>
              <span className="rounded-md bg-muted px-3 py-1.5 text-foreground font-semibold">
                {batchSummary.pdfs.length} PDF Notes
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteCard({
  pdf,
  onOpenPdf,
  onDownloadPdf,
}: {
  pdf: ParsedContentItem;
  onOpenPdf: (pdf: ParsedContentItem) => void;
  onDownloadPdf: (pdf: ParsedContentItem) => void;
}) {
  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-background p-4 divshadow transition hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#7567ee]/10 text-[#5a4bda] dark:bg-[#3dc280]/10 dark:text-[#29ff94]">
          <FileText className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Study Note
          </p>
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-foreground sm:text-base">
            {pdf.title}
          </h3>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenPdf(pdf)}
          className="flex flex-1 items-center justify-between rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-foreground/[0.07] cursor-pointer"
        >
          <span>Open Notes</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
        </button>

        <button
          type="button"
          onClick={() => onDownloadPdf(pdf)}
          aria-label="Download PDF"
          title="Download PDF"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-foreground/[0.03] text-foreground transition hover:bg-foreground/[0.08] cursor-pointer"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function EmptyStateCard({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-8 text-center text-sm text-muted-foreground">
      <FolderOpen className="mx-auto mb-3 h-7 w-7" />
      {message}
    </div>
  );
}
