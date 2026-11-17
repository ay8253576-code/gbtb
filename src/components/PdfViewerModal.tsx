import { ArrowLeft, Download, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ParsedContentItem } from '../types/study';

interface PdfViewerModalProps {
  pdf: ParsedContentItem;
  onClose: () => void;
}

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

export function PdfViewerModal({ pdf, onClose }: PdfViewerModalProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const rawBufferRef = useRef<ArrayBuffer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const resolvedUrl = pdf.pdfUrl
    ? pdf.pdfUrl.startsWith('/')
      ? pdf.pdfUrl
      : pdf.pdfUrl.startsWith('http://') || pdf.pdfUrl.startsWith('https://')
        ? `/api/v1/pdf-proxy?url=${encodeURIComponent(pdf.pdfUrl)}`
        : `/api/v1/secure/doc/${encodeURIComponent(pdf.pdfUrl)}`
    : '';

  useEffect(() => {
    let cancelled = false;
    async function loadPdf() {
      if (!resolvedUrl) {
        setErrorMsg('PDF document URL is unavailable.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(resolvedUrl);
        if (!res.ok) throw new Error(`Failed to fetch PDF (Status ${res.status})`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        rawBufferRef.current = buf.slice(0);
        if (!window.pdfjsLib) throw new Error('PDF engine is still loading, please retry.');
        const doc = await window.pdfjsLib.getDocument({
          data: buf,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
          cMapPacked: true,
        }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message || 'Unable to open PDF document.');
          setLoading(false);
        }
      }
    }
    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [resolvedUrl]);

  useEffect(() => {
    if (!pdfDoc || !containerRef.current) return;
    let cancelled = false;
    const container = containerRef.current;
    container.innerHTML = '';

    async function renderPages() {
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        if (cancelled) return;
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: zoom });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = 'mx-auto mb-4 rounded-lg shadow-lg bg-white max-w-full h-auto';

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        container.appendChild(canvas);
        await page.render({ canvasContext: ctx, viewport }).promise;
      }
    }

    renderPages();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, zoom]);

  const handleDownload = async () => {
    if (!resolvedUrl) return;
    let buf = rawBufferRef.current;
    if (!buf) {
      const r = await fetch(resolvedUrl);
      if (!r.ok) return;
      buf = await r.arrayBuffer();
      rawBufferRef.current = buf;
    }
    const blob = new Blob([buf], { type: 'application/pdf' });
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = pdf.fileName || `${pdf.title.replace(/[^\w\s-]/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 text-white">
      <header className="h-14 px-3 sm:px-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close PDF viewer"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-semibold text-white truncate">{pdf.title}</h2>
            {numPages > 0 && (
              <p className="text-[11px] text-slate-400 font-mono-num">{numPages} Pages · GB STUDY</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}
            aria-label="Zoom out"
            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)))}
            aria-label="Zoom in"
            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="px-3 py-2 rounded-lg bg-[#00b862] hover:bg-[#00a357] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-800/90">
        {loading && (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-9 h-9 animate-spin text-[#00b862]" />
            <p className="text-xs text-slate-300">Loading PDF notes...</p>
          </div>
        )}
        {!loading && errorMsg && (
          <div className="max-w-sm mx-auto mt-16 rounded-2xl bg-slate-900 border border-slate-700 p-6 text-center space-y-3">
            <p className="text-sm font-semibold text-red-400">{errorMsg}</p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-semibold cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
        <div ref={containerRef} className="max-w-4xl mx-auto flex flex-col items-center" />
      </div>
    </div>
  );
}
