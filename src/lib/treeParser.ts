import { ParsedContentItem, TreeFolderNode } from '../types/study';

export function formatLectureDate(iso?: string): string {
  if (!iso) return 'Recorded Class';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Recorded Class';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDuration(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) return '';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return '';
  const totalMinutes = Math.round((end - start) / 60000);
  if (totalMinutes <= 0) return '';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export function formatClassSchedule(iso?: string): {
  dateTimeLabel: string;
  timeOnly: string;
  countdown: string;
} {
  if (!iso) {
    return { dateTimeLabel: 'Time TBA', timeOnly: 'TBA', countdown: '' };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { dateTimeLabel: 'Time TBA', timeOnly: 'TBA', countdown: '' };
  }

  const timeOnly = d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

  const now = new Date();
  const fmtDay = (dt: Date) =>
    dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const targetDay = fmtDay(d);
  const todayDay = fmtDay(now);
  const tomorrow = new Date(now.getTime() + 86400 * 1000);
  const tomorrowDay = fmtDay(tomorrow);

  let dayLabel = d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
  if (targetDay === todayDay) dayLabel = 'Today';
  else if (targetDay === tomorrowDay) dayLabel = 'Tomorrow';

  const diffMs = d.getTime() - Date.now();
  let countdown = '';
  if (diffMs > 0) {
    const totalMins = Math.round(diffMs / 60000);
    if (totalMins < 60) {
      countdown = `Starts in ${totalMins}m`;
    } else if (totalMins < 24 * 60) {
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      countdown = m > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${h}h`;
    } else {
      const days = Math.floor(totalMins / (24 * 60));
      const h = Math.floor((totalMins % (24 * 60)) / 60);
      countdown = h > 0 ? `In ${days}d ${h}h` : `In ${days}d`;
    }
  } else if (diffMs > -2 * 3600 * 1000) {
    countdown = 'Starting Soon';
  }

  return {
    dateTimeLabel: `${dayLabel} · ${timeOnly}`,
    timeOnly,
    countdown,
  };
}

function normalizeContentEntry(rawItem: any): ParsedContentItem | null {
  if (!rawItem || typeof rawItem !== 'object') return null;
  const source =
    rawItem.refId && typeof rawItem.refId === 'object'
      ? rawItem.refId
      : rawItem.source && typeof rawItem.source === 'object'
        ? rawItem.source
        : rawItem;
  const id = String(source._id || source.id || rawItem._id || rawItem.id || Math.random());
  const title = String(source.title || source.name || rawItem.title || 'Untitled').trim();

  const pdfUrl =
    source.pdf?.url ||
    source.pdfUrl ||
    source.pdf_link ||
    source.notesUrl ||
    source.fileUrl ||
    source.attachmentUrl ||
    rawItem.pdf?.url ||
    rawItem.pdfUrl ||
    rawItem.pdf_link ||
    rawItem.notesUrl ||
    '';

  const assetId =
    source.tpAssetId ||
    source.liveAssetId ||
    source.video?.assetId ||
    source.assetId ||
    rawItem.tpAssetId ||
    rawItem.liveAssetId ||
    rawItem.video?.assetId ||
    rawItem.assetId ||
    '';

  const rawYtId = String(source.youtubeId || rawItem.youtubeId || '').trim();
  const hlsUrl =
    source.hlsUrl ||
    rawItem.hlsUrl ||
    source.playbackUrl ||
    rawItem.playbackUrl ||
    source.liveUrl ||
    rawItem.liveUrl ||
    source.streamUrl ||
    rawItem.streamUrl ||
    source.m3u8Url ||
    rawItem.m3u8Url ||
    source.videoUrl ||
    rawItem.videoUrl ||
    source.video?.url ||
    rawItem.video?.url ||
    source.youtubeUrl ||
    rawItem.youtubeUrl ||
    source.embedUrl ||
    rawItem.embedUrl ||
    (rawYtId ? `https://www.youtube.com/watch?v=${rawYtId}` : '') ||
    '';

  const isPdf =
    source.type === 'pdf' ||
    rawItem.type === 'pdf' ||
    (!!pdfUrl && !assetId && !hlsUrl);

  if (isPdf && pdfUrl) {
    return {
      id,
      title,
      type: 'pdf',
      pdfUrl,
      fileName: source.pdf?.fileName || rawItem.pdf?.fileName || `${title}.pdf`,
      createdAt: source.createdAt || rawItem.createdAt,
      sequence: rawItem.sequence ?? source.sequence ?? 0,
      raw: rawItem,
    };
  }

  const stLower = String(source.status || '').toLowerCase();
  const tpUpper = String(source.tpStatus || '').toUpperCase();
  const typeLower = String(source.type || rawItem.type || '').toLowerCase();

  if (
    assetId ||
    hlsUrl ||
    typeLower === 'video' ||
    typeLower === 'stream' ||
    typeLower === 'live' ||
    stLower === 'live' ||
    stLower === 'scheduled' ||
    stLower === 'upcoming' ||
    tpUpper === 'STREAMING' ||
    tpUpper === 'NOT_STARTED' ||
    source.isLive === true ||
    rawItem.isLive === true
  ) {
    const isLive =
      tpUpper === 'STREAMING' ||
      stLower === 'live' ||
      source.isLive === true ||
      rawItem.isLive === true ||
      false;

    const thumbUrl = source.bannerUrl || source.thumbnail || rawItem.bannerUrl || rawItem.thumbnail || '';
    const dur = formatDuration(source.actualStartTime || source.startTime, source.endTime);

    return {
      id,
      streamId: String(source._id || source.id || rawItem._id || ''),
      title,
      type: typeLower === 'stream' || typeLower === 'live' || isLive ? 'stream' : 'video',
      assetId: assetId || undefined,
      hlsUrl: hlsUrl || undefined,
      thumbnailUrl: thumbUrl || undefined,
      description: source.description || rawItem.description || '',
      createdAt: source.startTime || source.scheduledAt || source.createdAt || rawItem.createdAt,
      durationText: dur || undefined,
      isLive,
      status: source.status || source.tpStatus,
      sequence: rawItem.sequence ?? source.sequence ?? 0,
      raw: rawItem,
    };
  }

  return null;
}

function parseFolderNode(rawNode: any): TreeFolderNode {
  const id = String(rawNode._id || rawNode.id || Math.random());
  const name = String(rawNode.name || rawNode.title || 'Folder').trim();

  const childFolders: TreeFolderNode[] = Array.isArray(rawNode.children)
    ? rawNode.children.map(parseFolderNode)
    : [];

  const seenKeys = new Map<string, ParsedContentItem>();
  const videos: ParsedContentItem[] = [];
  const pdfs: ParsedContentItem[] = [];

  const buckets = [
    ...(Array.isArray(rawNode.lessons) ? rawNode.lessons : []),
    ...(Array.isArray(rawNode.streams) ? rawNode.streams : []),
    ...(Array.isArray(rawNode.contents) ? rawNode.contents : []),
  ];

  for (const entry of buckets) {
    const parsed = normalizeContentEntry(entry);
    if (!parsed) continue;

    const kind = parsed.type === 'pdf' ? 'pdf' : 'media';
    const candidateKeys: string[] = [];
    if (parsed.streamId) candidateKeys.push(`${kind}:sid:${parsed.streamId}`);
    if (parsed.id && !parsed.id.startsWith('0.')) candidateKeys.push(`${kind}:id:${parsed.id}`);
    if (parsed.assetId) candidateKeys.push(`${kind}:asset:${parsed.assetId}`);
    if (parsed.hlsUrl && parsed.type !== 'pdf') candidateKeys.push(`${kind}:hls:${parsed.hlsUrl}`);
    if (parsed.pdfUrl && parsed.type === 'pdf') candidateKeys.push(`${kind}:pdf:${parsed.pdfUrl}`);
    if (candidateKeys.length === 0) {
      candidateKeys.push(`${kind}:title:${parsed.title.toLowerCase()}`);
    }

    let existing: ParsedContentItem | undefined;
    for (const k of candidateKeys) {
      const hit = seenKeys.get(k);
      if (hit) {
        existing = hit;
        break;
      }
    }

    if (existing) {
      if (!existing.assetId && parsed.assetId) existing.assetId = parsed.assetId;
      if (!existing.hlsUrl && parsed.hlsUrl) existing.hlsUrl = parsed.hlsUrl;
      if (!existing.thumbnailUrl && parsed.thumbnailUrl) existing.thumbnailUrl = parsed.thumbnailUrl;
      if (!existing.durationText && parsed.durationText) existing.durationText = parsed.durationText;
      if (!existing.createdAt && parsed.createdAt) existing.createdAt = parsed.createdAt;
      if (parsed.isLive) existing.isLive = true;
      for (const k of candidateKeys) seenKeys.set(k, existing);
      continue;
    }

    for (const k of candidateKeys) seenKeys.set(k, parsed);

    if (parsed.type === 'pdf') {
      pdfs.push(parsed);
    } else {
      videos.push(parsed);
    }
  }

  let totalVideos = videos.length;
  let totalNotes = pdfs.length;
  for (const ch of childFolders) {
    totalVideos += ch.totalVideos;
    totalNotes += ch.totalNotes;
  }

  return {
    id,
    name,
    children: childFolders,
    videos,
    pdfs,
    totalVideos,
    totalNotes,
    totalExercises: 0,
    raw: rawNode,
  };
}

export function buildSyllabusTree(rawTree: any[]): TreeFolderNode[] {
  if (!Array.isArray(rawTree)) return [];
  return rawTree.map(parseFolderNode);
}

export function collectAllFromFolder(folder: TreeFolderNode): {
  videos: ParsedContentItem[];
  pdfs: ParsedContentItem[];
} {
  const videos: ParsedContentItem[] = [...folder.videos];
  const pdfs: ParsedContentItem[] = [...folder.pdfs];
  for (const child of folder.children) {
    const sub = collectAllFromFolder(child);
    videos.push(...sub.videos);
    pdfs.push(...sub.pdfs);
  }
  return { videos, pdfs };
}
