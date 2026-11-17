export interface BatchItem {
  id: string;
  _id?: string;
  title: string;
  name?: string;
  thumbnail: string;
  isVgCourse?: boolean;
  provider?: string;
  faculty?: string;
  category?: string;
}

export interface StudentUser {
  id: string;
  name: string;
  fullName: string;
  email: string;
  mobile: string;
  role: string;
  isAdmin?: boolean;
}

export interface ParsedContentItem {
  id: string;
  streamId?: string;
  courseId?: string;
  title: string;
  type: 'video' | 'stream' | 'pdf';
  assetId?: string;
  hlsUrl?: string;
  pdfUrl?: string;
  fileName?: string;
  thumbnailUrl?: string;
  description?: string;
  createdAt?: string;
  durationText?: string;
  isLive?: boolean;
  status?: string;
  sequence?: number;
  raw?: any;
}

export interface TreeFolderNode {
  id: string;
  name: string;
  children: TreeFolderNode[];
  videos: ParsedContentItem[];
  pdfs: ParsedContentItem[];
  totalVideos: number;
  totalNotes: number;
  totalExercises: number;
  raw?: any;
}

export interface LiveStreamItem {
  id: string;
  title: string;
  courseId?: string;
  courseIds?: string[];
  courseTitle?: string;
  assetId?: string;
  hlsUrl?: string;
  bannerUrl?: string;
  teacher?: string;
  startTime?: string;
  status?: string;
}

export interface VideoPlaybackContext {
  lecture: ParsedContentItem;
  siblingLectures: ParsedContentItem[];
  relatedPdfs: ParsedContentItem[];
  courseId?: string;
}
