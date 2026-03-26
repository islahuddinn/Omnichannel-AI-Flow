// src/components/chat/MessageAttachment.jsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { FileText, Download, X, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ZoomableImage from './ZoomableImage';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

/**
 * Lazy image component — only loads when visible in viewport.
 * Shows a subtle shimmer placeholder until the image loads.
 */
function LazyImage({ src, alt, className, style, onLoad, onError, onClick, blurDataUrl }) {
  const imgRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className="relative" onClick={onClick}>
      {/* Blur placeholder (LQIP) or shimmer fallback */}
      {!isLoaded && (
        blurDataUrl ? (
          <img
            src={blurDataUrl}
            alt=""
            className={cn('rounded-md blur-sm scale-105', className)}
            style={{ ...style, minHeight: '120px', minWidth: '150px', objectFit: 'cover' }}
            aria-hidden="true"
          />
        ) : (
          <div
            className={cn('animate-pulse bg-[#e4e6e8] dark:bg-[#2a3942] rounded-md', className)}
            style={{ ...style, minHeight: '120px', minWidth: '150px' }}
          />
        )
      )}
      {isVisible && (
        <img
          src={src}
          alt={alt}
          className={cn(className, !isLoaded && 'absolute inset-0 opacity-0')}
          style={style}
          loading="lazy"
          decoding="async"
          onLoad={(e) => {
            setIsLoaded(true);
            onLoad?.(e);
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

export default function MessageAttachment({ attachment, isOwn, allAttachments = [], currentIndex = 0 }) {
  const [showLightbox, setShowLightbox] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [lightboxLoading, setLightboxLoading] = useState(true);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [imageDimensions, setImageDimensions] = useState(null);
  const videoRef = useRef(null);

  const isImage = attachment.type === 'image' || attachment.mimeType?.startsWith('image/');
  const isSticker = attachment.type === 'sticker';
  const isGif = attachment.mimeType === 'image/gif' || attachment.name?.toLowerCase().endsWith('.gif');
  const isVideo = attachment.type === 'video' || attachment.mimeType?.startsWith('video/');
  const isAudio = attachment.type === 'audio' || attachment.mimeType?.startsWith('audio/');
  const isDocument = attachment.type === 'document' ||
                    !isImage && !isSticker && !isVideo && !isAudio;

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getDocumentStyle = (att) => {
    const name = att?.name || '';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const mime = att?.mimeType || '';

    // PDF
    if (ext === 'pdf' || mime === 'application/pdf')
      return { label: 'PDF', bg: 'bg-[#e5252a]', text: 'text-white' };

    // Word / Rich Text
    if (['doc', 'docx', 'rtf', 'odt'].includes(ext) || mime.includes('word') || mime.includes('opendocument.text') || mime.includes('rtf'))
      return { label: ext === 'odt' ? 'ODT' : ext === 'rtf' ? 'RTF' : 'DOC', bg: 'bg-[#2b579a]', text: 'text-white' };

    // Excel / Spreadsheet
    if (['xls', 'xlsx', 'csv', 'ods', 'tsv'].includes(ext) || mime.includes('sheet') || mime.includes('excel') || mime.includes('spreadsheet') || mime === 'text/csv')
      return { label: ext === 'csv' ? 'CSV' : ext === 'ods' ? 'ODS' : 'XLS', bg: 'bg-[#217346]', text: 'text-white' };

    // PowerPoint / Presentation
    if (['ppt', 'pptx', 'odp'].includes(ext) || mime.includes('presentation') || mime.includes('powerpoint'))
      return { label: ext === 'odp' ? 'ODP' : 'PPT', bg: 'bg-[#d24726]', text: 'text-white' };

    // Images (when shown as document)
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'tif', 'ico', 'heic', 'heif', 'avif'].includes(ext) || mime.startsWith('image/'))
      return { label: ext === 'svg' ? 'SVG' : 'IMG', bg: 'bg-[#8e44ad]', text: 'text-white' };

    // Audio (when shown as document)
    if (['mp3', 'wav', 'aac', 'ogg', 'flac', 'wma', 'm4a', 'opus'].includes(ext) || mime.startsWith('audio/'))
      return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#e67e22]', text: 'text-white' };

    // Video (when shown as document)
    if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv', '3gp', 'm4v'].includes(ext) || mime.startsWith('video/'))
      return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#9b59b6]', text: 'text-white' };

    // Archives / Compressed
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'tar.gz'].includes(ext) || mime.includes('zip') || mime.includes('archive') || mime.includes('compressed') || mime.includes('tar'))
      return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#f39c12]', text: 'text-white' };

    // Code / Programming
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rb', 'php', 'swift', 'kt', 'rs', 'dart', 'sh', 'bash', 'sql', 'r', 'scala', 'lua', 'pl', 'vue', 'svelte'].includes(ext))
      return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#2ecc71]', text: 'text-white' };

    // Web / Markup
    if (['html', 'htm', 'css', 'scss', 'less', 'sass', 'xml', 'xhtml', 'jsx'].includes(ext) || mime.includes('html') || mime.includes('xml'))
      return { label: ext.toUpperCase().slice(0, 4), bg: 'bg-[#e74c3c]', text: 'text-white' };

    // Data / Config
    if (['json', 'yaml', 'yml', 'toml', 'ini', 'env', 'cfg', 'conf'].includes(ext))
      return { label: ext.toUpperCase().slice(0, 4), bg: 'bg-[#1abc9c]', text: 'text-white' };

    // Text / Logs / Markdown
    if (['txt', 'log', 'md', 'markdown', 'rst', 'tex', 'latex'].includes(ext) || mime.startsWith('text/'))
      return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#7f8c8d]', text: 'text-white' };

    // Fonts
    if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(ext) || mime.includes('font'))
      return { label: ext.toUpperCase().slice(0, 4), bg: 'bg-[#34495e]', text: 'text-white' };

    // Database
    if (['db', 'sqlite', 'sqlite3', 'mdb', 'accdb'].includes(ext))
      return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#2c3e50]', text: 'text-white' };

    // CAD / Design
    if (['psd', 'ai', 'sketch', 'fig', 'xd', 'dwg', 'dxf'].includes(ext))
      return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#00c8ff]', text: 'text-white' };

    // eBook
    if (['epub', 'mobi', 'azw', 'azw3', 'fb2'].includes(ext))
      return { label: ext.toUpperCase().slice(0, 4), bg: 'bg-[#8e44ad]', text: 'text-white' };

    // Executable / Installer
    if (['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'apk', 'ipa', 'appimage'].includes(ext))
      return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#c0392b]', text: 'text-white' };

    // Disk images / ISOs
    if (['iso', 'img', 'bin', 'vmdk', 'vdi'].includes(ext))
      return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#95a5a6]', text: 'text-white' };

    // vCard / Calendar
    if (['vcf', 'vcard'].includes(ext) || mime.includes('vcard'))
      return { label: 'VCF', bg: 'bg-[#00a884]', text: 'text-white' };
    if (['ics', 'ical'].includes(ext) || mime.includes('calendar'))
      return { label: 'CAL', bg: 'bg-[#3498db]', text: 'text-white' };

    // Fallback: use extension or "FILE"
    return { label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE', bg: 'bg-[#7f8c8d]', text: 'text-white' };
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Image / Sticker / GIF ──
  if (isImage || isSticker) {
    // GIFs: autoplay like WhatsApp (no click-to-play, just shows animated)
    if (isGif) {
      return (
        <>
          <div
            className="rounded-md overflow-hidden cursor-pointer hover:opacity-90 transition-opacity relative group"
            onClick={() => setShowLightbox(true)}
          >
            {imageError ? (
              <div className="flex items-center justify-center bg-[#e4e6e8] dark:bg-[#2a3942] text-[#667781] text-sm rounded-md w-[250px] h-[180px]">
                <FileText className="h-6 w-6 mr-2 opacity-50" />
                Failed to load
              </div>
            ) : (
              <LazyImage
                src={attachment.url}
                alt={attachment.name || 'GIF'}
                className="w-auto h-auto max-w-full object-contain rounded-md"
                style={{ maxHeight: '250px', maxWidth: '100%', display: 'block' }}
                onError={() => setImageError(true)}
                blurDataUrl={attachment.blurDataUrl || attachment.metadata?.blurDataUrl}
              />
            )}
            {/* GIF badge */}
            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
              GIF
            </div>
            {/* Download on hover */}
            <a
              href={attachment.url}
              download={attachment.name}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-7 w-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70">
                <Download className="h-3.5 w-3.5 text-white" />
              </div>
            </a>
          </div>

          {/* Lightbox */}
          <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
            <DialogContent className="max-w-screen min-w-screen w-screen h-screen p-0 border-none bg-transparent shadow-none flex items-center justify-center">
              <VisuallyHidden><DialogTitle>GIF Preview</DialogTitle></VisuallyHidden>
              <Button size="icon" variant="ghost" onClick={() => setShowLightbox(false)} className="fixed top-4 right-4 z-50 rounded-full bg-black/60 text-white hover:bg-black/80">
                <X className="h-5 w-5" />
              </Button>
              <img src={attachment.url} alt={attachment.name || 'GIF'} className="object-contain" style={{ maxWidth: '96vw', maxHeight: '96vh' }} />
            </DialogContent>
          </Dialog>
        </>
      );
    }

    // Stickers: transparent background, smaller size
    if (isSticker) {
      return (
        <>
          <div
            className="cursor-pointer hover:scale-105 transition-transform"
            onClick={() => setShowLightbox(true)}
          >
            <LazyImage
              src={attachment.url}
              alt={attachment.name || 'Sticker'}
              className="max-w-[160px] max-h-[160px] object-contain drop-shadow-md"
              style={{ display: 'block' }}
              blurDataUrl={attachment.blurDataUrl || attachment.metadata?.blurDataUrl}
              onError={() => setImageError(true)}
            />
          </div>

          <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
            <DialogContent className="max-w-screen min-w-screen w-screen h-screen p-0 border-none bg-transparent shadow-none flex items-center justify-center">
              <VisuallyHidden><DialogTitle>Sticker Preview</DialogTitle></VisuallyHidden>
              <Button size="icon" variant="ghost" onClick={() => setShowLightbox(false)} className="fixed top-4 right-4 z-50 rounded-full bg-black/60 text-white hover:bg-black/80">
                <X className="h-5 w-5" />
              </Button>
              <img src={attachment.url} alt="Sticker" className="object-contain max-w-md" style={{ maxWidth: '80vw', maxHeight: '80vh' }} />
            </DialogContent>
          </Dialog>
        </>
      );
    }

    // Regular images
    return (
      <>
        <div
          className="rounded-md overflow-hidden cursor-pointer hover:opacity-90 transition-opacity relative group"
          onClick={() => setShowLightbox(true)}
        >
          {imageError ? (
            <div className="flex items-center justify-center bg-[#e4e6e8] dark:bg-[#2a3942] text-[#667781] text-sm rounded-md w-[250px] h-[180px]">
              <FileText className="h-6 w-6 mr-2 opacity-50" />
              Failed to load
            </div>
          ) : (
            <LazyImage
              src={attachment.url}
              alt={attachment.name || 'Image'}
              className="w-auto h-auto max-w-full object-contain rounded-md"
              style={{ maxHeight: '280px', maxWidth: '100%', display: 'block' }}
              onError={() => setImageError(true)}
              blurDataUrl={attachment.blurDataUrl || attachment.metadata?.blurDataUrl}
            />
          )}
          {/* Download button on hover */}
          <a
            href={attachment.url}
            download={attachment.name}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-7 w-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70">
              <Download className="h-3.5 w-3.5 text-white" />
            </div>
          </a>
          {/* Size on hover */}
          {attachment.size && (
            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
              {formatSize(attachment.size)}
            </div>
          )}
        </div>

        {/* Lightbox */}
        <Dialog open={showLightbox} onOpenChange={setShowLightbox}>
          <DialogContent className="max-w-screen min-w-screen w-screen h-screen p-0 border-none bg-transparent shadow-none flex items-center justify-center">
            <VisuallyHidden>
              <DialogTitle>{attachment.name || 'Image Preview'}</DialogTitle>
            </VisuallyHidden>
            <Button size="icon" variant="ghost" onClick={() => setShowLightbox(false)} className="fixed top-4 right-4 z-50 rounded-full bg-black/60 text-white hover:bg-black/80">
              <X className="h-5 w-5" />
            </Button>
            {/* Download in lightbox */}
            <a href={attachment.url} download={attachment.name} target="_blank" rel="noopener noreferrer" className="fixed top-4 left-4 z-50">
              <Button size="icon" variant="ghost" className="rounded-full bg-black/60 text-white hover:bg-black/80">
                <Download className="h-5 w-5" />
              </Button>
            </a>

            {allAttachments.filter(a => a.type === 'image' || a.type === 'sticker' || a.mimeType?.startsWith('image/')).length > 1 ? (
              <Carousel className="w-full h-full" opts={{ startIndex: currentIndex }}>
                <CarouselContent className="h-full">
                  {allAttachments
                    .filter(a => a.type === 'image' || a.type === 'sticker' || a.mimeType?.startsWith('image/'))
                    .map((img, idx) => (
                      <CarouselItem key={idx} className="h-full flex items-center justify-center">
                        <img
                          src={img.url}
                          alt={img.name || `Image ${idx + 1}`}
                          className="object-contain"
                          style={{ maxWidth: '96vw', maxHeight: '96vh', width: 'auto', height: 'auto' }}
                          loading="eager"
                          decoding="async"
                        />
                      </CarouselItem>
                    ))}
                </CarouselContent>
                <CarouselPrevious className="left-4 bg-black/60 text-white hover:bg-black/80" />
                <CarouselNext className="right-4 bg-black/60 text-white hover:bg-black/80" />
              </Carousel>
            ) : (
              <>
                {lightboxLoading && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <Loader2 className="h-10 w-10 text-white animate-spin" />
                  </div>
                )}
                <ZoomableImage
                  src={attachment.url}
                  alt={attachment.name || 'Image'}
                  style={{ maxWidth: '96vw', maxHeight: '90vh', width: 'auto', height: 'auto' }}
                  onLoad={() => setLightboxLoading(false)}
                  onDimensionsLoad={(dims) => setImageDimensions(dims)}
                />
                {/* Resolution + size info footer */}
                {imageDimensions && (
                  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm flex items-center gap-2">
                    <span>{imageDimensions.width} x {imageDimensions.height}</span>
                    {attachment.size && (
                      <>
                        <span className="text-white/40">|</span>
                        <span>{formatSize(attachment.size)}</span>
                      </>
                    )}
                    {attachment.name && (
                      <>
                        <span className="text-white/40">|</span>
                        <span className="max-w-[200px] truncate">{attachment.name}</span>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ── Video ── WhatsApp style: thumbnail with centered play button
  if (isVideo) {
    return (
      <>
        <div className="rounded-md overflow-hidden relative group cursor-pointer" style={{ maxWidth: '320px' }}>
          {!videoPlaying ? (
            <div className="relative" onClick={() => setVideoPlaying(true)}>
              {/* Video as thumbnail (first frame) */}
              <video
                ref={videoRef}
                src={attachment.url}
                className="w-full max-h-[280px] object-contain bg-black rounded-md"
                preload="metadata"
                muted
                playsInline
              />
              {/* Dark overlay */}
              <div className="absolute inset-0 bg-black/20 rounded-md" />
              {/* Centered play button — WhatsApp style */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-14 w-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors">
                  <Play className="h-7 w-7 text-white ml-1" fill="white" />
                </div>
              </div>
              {/* Duration badge */}
              {attachment.duration && (
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[11px] px-1.5 py-0.5 rounded">
                  {formatDuration(attachment.duration)}
                </div>
              )}
              {/* Size badge */}
              {attachment.size && (
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatSize(attachment.size)}
                </div>
              )}
            </div>
          ) : (
            <video
              src={attachment.url}
              controls
              autoPlay
              className="w-full max-h-[280px] object-contain bg-black rounded-md"
              preload="auto"
              playsInline
            />
          )}
          {/* Download on hover */}
          <a
            href={attachment.url}
            download={attachment.name}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-7 w-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70">
              <Download className="h-3.5 w-3.5 text-white" />
            </div>
          </a>
        </div>
      </>
    );
  }

  // ── Audio ── (fallback — VoicePlayer handles most audio in MessageList)
  if (isAudio) {
    return (
      <div className={cn(
        'p-3 rounded-lg',
        isOwn ? 'bg-[#d9fdd3]/50 dark:bg-[#005c4b]/50' : 'bg-[#f0f2f5] dark:bg-[#202c33]'
      )}>
        <audio
          src={attachment.url}
          controls
          controlsList="nodownload"
          className="w-full max-w-[280px]"
          preload="metadata"
        />
        {(attachment.duration || attachment.size) && (
          <div className="flex items-center justify-between mt-1 text-xs text-[#667781] dark:text-[#8696a0]">
            {attachment.duration && <span>{formatDuration(attachment.duration)}</span>}
            {attachment.size && <span>{formatSize(attachment.size)}</span>}
          </div>
        )}
      </div>
    );
  }

  // ── Document ── WhatsApp-style card with PDF preview
  const docStyle = getDocumentStyle(attachment);
  const fileName = attachment.name || 'Document';
  const sizeStr = attachment.size ? formatSize(attachment.size) : '';
  const isPdf = docStyle.label === 'PDF';
  const pageCount = attachment.metadata?.pages || attachment.pages || null;

  return (
    <div className="max-w-[280px]">
      {/* PDF preview thumbnail */}
      {isPdf && attachment.url && (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-t-lg overflow-hidden bg-[#f5f5f5] dark:bg-[#1a2329] border border-b-0 border-[#e9edef] dark:border-[#2a3942] hover:opacity-90 transition-opacity"
        >
          <div className="relative h-[140px] flex items-center justify-center overflow-hidden">
            <iframe
              src={`${attachment.url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              className="w-[280px] h-[400px] scale-[0.35] origin-top-left pointer-events-none"
              style={{ width: '800px', height: '400px', transform: 'scale(0.35)', transformOrigin: 'top left' }}
              title="PDF Preview"
              loading="lazy"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            {/* PDF badge overlay */}
            <div className="absolute top-2 left-2 bg-[#e5252a] text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              PDF
            </div>
            {pageCount && (
              <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">
                {pageCount} pages
              </div>
            )}
          </div>
        </a>
      )}

      {/* Document info bar */}
      <div className={cn(
        'flex items-center gap-3 p-3 min-w-0',
        isPdf ? 'rounded-b-lg border border-t-0 border-[#e9edef] dark:border-[#2a3942]' : 'rounded-lg',
        isOwn ? 'bg-[#d9fdd3]/60 dark:bg-[#005c4b]/40' : 'bg-[#f0f2f5] dark:bg-[#202c33]'
      )}>
        {/* Type badge (hidden for PDF if preview is shown) */}
        {(!isPdf || !attachment.url) && (
          <div className={cn(
            'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-[10px]',
            docStyle.bg, docStyle.text
          )}>
            {docStyle.label}
          </div>
        )}
        {isPdf && attachment.url && (
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#e5252a] flex items-center justify-center">
            <FileText className="h-5 w-5 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[#111b21] dark:text-[#e9edef] truncate">
            {fileName}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {sizeStr && (
              <span className="text-[11px] text-[#667781] dark:text-[#8696a0]">{sizeStr}</span>
            )}
            {sizeStr && pageCount && <span className="text-[#667781]/40">·</span>}
            {pageCount && (
              <span className="text-[11px] text-[#667781] dark:text-[#8696a0]">{pageCount} pages</span>
            )}
          </div>
        </div>
        <a href={attachment.url} download={attachment.name} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-[#00a884]/10 flex items-center justify-center hover:bg-[#00a884]/20 transition-colors">
            <Download className="h-4 w-4 text-[#00a884]" />
          </div>
        </a>
      </div>
    </div>
  );
}
