// src/components/chat/MessageAttachmentGroup.jsx - WhatsApp-style Grouped Attachments
'use client';

import { useState, useEffect, useRef } from 'react';
import { Download, Play, Volume2, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { motion, AnimatePresence } from 'framer-motion';
import ZoomableImage from './ZoomableImage';

/**
 * Lazy image for grids — loads when scrolled into viewport
 */
function LazyGridImage({ src, alt, className, onClick }) {
  const ref = useRef(null);
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
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn('relative', className)} onClick={onClick}>
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-[#e4e6e8] dark:bg-[#2a3942]" />
      )}
      {isVisible && (
        <img
          src={src}
          alt={alt}
          className={cn('w-full h-full object-cover', !isLoaded && 'opacity-0')}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
        />
      )}
    </div>
  );
}

export default function MessageAttachmentGroup({ attachments = [], isOwn }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxLoading, setLightboxLoading] = useState(true);

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter(a => a.type === 'image' || a.mimeType?.startsWith('image/'));
  const videos = attachments.filter(a => a.type === 'video' || a.mimeType?.startsWith('video/'));
  const audios = attachments.filter(a => a.type === 'audio' || a.mimeType?.startsWith('audio/'));
  const documents = attachments.filter(a =>
    a.type === 'document' ||
    (!a.type?.match(/image|video|audio/) && !a.mimeType?.match(/image|video|audio/))
  );

  const mediaItems = [...images, ...videos];
  const hasMedia = mediaItems.length > 0;
  const hasDocuments = documents.length > 0;
  const hasAudio = audios.length > 0;

  useEffect(() => {
    setLightboxLoading(true);
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') prevItem();
      else if (e.key === 'ArrowRight') nextItem();
      else if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, mediaItems.length]);

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const openLightbox = (index) => {
    setCurrentIndex(index);
    setLightboxOpen(true);
  };

  const nextItem = () => setCurrentIndex((prev) => (prev + 1) % mediaItems.length);
  const prevItem = () => setCurrentIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length);

  const downloadAttachment = (attachment) => {
    const link = document.createElement('a');
    link.href = attachment.url;
    link.download = attachment.name || 'download';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Media item renderer for grids ──
  const renderGridItem = (item, idx, size = 'normal') => {
    const isVideo = item.type === 'video' || item.mimeType?.startsWith('video/');

    return (
      <div
        key={idx}
        className="rounded-md overflow-hidden cursor-pointer hover:opacity-95 transition-opacity relative group aspect-square"
        onClick={() => openLightbox(idx)}
      >
        {isVideo ? (
          <>
            <video
              src={item.url}
              className="w-full h-full object-cover"
              preload="metadata"
              muted
              playsInline
            />
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={cn(
                'rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center',
                size === 'large' ? 'h-14 w-14' : 'h-10 w-10'
              )}>
                <Play className={cn('text-white ml-0.5', size === 'large' ? 'h-7 w-7' : 'h-5 w-5')} fill="white" />
              </div>
            </div>
            {item.duration && (
              <div className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded">
                {formatDuration(item.duration)}
              </div>
            )}
          </>
        ) : (
          <LazyGridImage
            src={item.url}
            alt={item.name || `Image ${idx + 1}`}
            className="w-full h-full"
          />
        )}
      </div>
    );
  };

  // ── WhatsApp-style grid layouts ──
  const renderMediaGrid = () => {
    if (mediaItems.length === 0) return null;

    // Single item
    if (mediaItems.length === 1) {
      const item = mediaItems[0];
      const isVideo = item.type === 'video' || item.mimeType?.startsWith('video/');

      return (
        <div
          className="rounded-md overflow-hidden cursor-pointer hover:opacity-95 transition-opacity relative group"
          style={{ maxWidth: '100%' }}
          onClick={() => openLightbox(0)}
        >
          {isVideo ? (
            <>
              <video src={item.url} className="w-auto h-auto max-w-full object-contain max-h-[280px]" preload="metadata" muted playsInline style={{ display: 'block' }} />
              <div className="absolute inset-0 bg-black/20 rounded-md" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-14 w-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors">
                  <Play className="h-7 w-7 text-white ml-1" fill="white" />
                </div>
              </div>
              {item.duration && (
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[11px] px-1.5 py-0.5 rounded">
                  {formatDuration(item.duration)}
                </div>
              )}
            </>
          ) : (
            <LazyGridImage
              src={item.url}
              alt={item.name || 'Image'}
              className="w-auto h-auto max-w-full max-h-[280px] rounded-md"
            />
          )}
          {item.size && (
            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
              {formatSize(item.size)}
            </div>
          )}
        </div>
      );
    }

    // 2 items — side by side
    if (mediaItems.length === 2) {
      return (
        <div className="grid grid-cols-2 gap-0.5 max-w-[320px] rounded-md overflow-hidden">
          {mediaItems.map((item, idx) => renderGridItem(item, idx))}
        </div>
      );
    }

    // 3 items — 1 large left + 2 stacked right
    if (mediaItems.length === 3) {
      return (
        <div className="grid grid-cols-2 gap-0.5 max-w-[320px] rounded-md overflow-hidden" style={{ gridTemplateRows: '1fr 1fr' }}>
          <div className="row-span-2 rounded-md overflow-hidden cursor-pointer hover:opacity-95 transition-opacity relative group" onClick={() => openLightbox(0)}>
            {mediaItems[0].type === 'video' || mediaItems[0].mimeType?.startsWith('video/') ? (
              <>
                <video src={mediaItems[0].url} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-12 w-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <Play className="h-6 w-6 text-white ml-0.5" fill="white" />
                  </div>
                </div>
              </>
            ) : (
              <LazyGridImage src={mediaItems[0].url} alt="Image 1" className="w-full h-full" />
            )}
          </div>
          {mediaItems.slice(1, 3).map((item, idx) => renderGridItem(item, idx + 1))}
        </div>
      );
    }

    // 4+ items — 2x2 grid with "+N more" overlay
    return (
      <div className="grid grid-cols-2 gap-0.5 max-w-[320px] rounded-md overflow-hidden">
        {mediaItems.slice(0, 4).map((item, idx) => (
          <div key={idx} className="relative">
            {renderGridItem(item, idx)}
            {idx === 3 && mediaItems.length > 4 && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-md cursor-pointer" onClick={() => openLightbox(3)}>
                <span className="text-white text-2xl font-bold">+{mediaItems.length - 4}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // ── Audio list ──
  const renderAudio = () => {
    if (audios.length === 0) return null;
    return (
      <div className="space-y-2 mt-2">
        {audios.map((audio, idx) => (
          <div key={idx} className={cn('flex items-center gap-2 p-2 rounded-lg', isOwn ? 'bg-[#d9fdd3]/50 dark:bg-[#005c4b]/50' : 'bg-[#f0f2f5] dark:bg-[#202c33]')}>
            <Volume2 className="h-4 w-4 text-[#667781] flex-shrink-0" />
            <audio src={audio.url} controls className="flex-1" preload="metadata" />
            {audio.duration && <span className="text-xs text-[#667781]">{formatDuration(audio.duration)}</span>}
          </div>
        ))}
      </div>
    );
  };

  // Document type badge helper
  const getDocStyle = (name) => {
    const ext = (name || '').split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return { label: 'PDF', bg: 'bg-[#e5252a]' };
    if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) return { label: ext === 'odt' ? 'ODT' : 'DOC', bg: 'bg-[#2b579a]' };
    if (['xls', 'xlsx', 'csv', 'ods', 'tsv'].includes(ext)) return { label: ext === 'csv' ? 'CSV' : 'XLS', bg: 'bg-[#217346]' };
    if (['ppt', 'pptx', 'odp'].includes(ext)) return { label: 'PPT', bg: 'bg-[#d24726]' };
    if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz'].includes(ext)) return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#f39c12]' };
    if (['js', 'ts', 'py', 'java', 'cpp', 'go', 'rb', 'php', 'swift', 'sql', 'sh'].includes(ext)) return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#2ecc71]' };
    if (['html', 'css', 'xml', 'json', 'yaml', 'yml'].includes(ext)) return { label: ext.toUpperCase().slice(0, 4), bg: 'bg-[#e74c3c]' };
    if (['txt', 'log', 'md'].includes(ext)) return { label: ext.toUpperCase(), bg: 'bg-[#7f8c8d]' };
    if (['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'].includes(ext)) return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#e67e22]' };
    if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#9b59b6]' };
    if (['exe', 'msi', 'dmg', 'apk', 'deb'].includes(ext)) return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#c0392b]' };
    if (['psd', 'ai', 'sketch', 'fig', 'xd'].includes(ext)) return { label: ext.toUpperCase().slice(0, 3), bg: 'bg-[#00c8ff]' };
    if (['epub', 'mobi'].includes(ext)) return { label: ext.toUpperCase(), bg: 'bg-[#8e44ad]' };
    if (['vcf', 'vcard'].includes(ext)) return { label: 'VCF', bg: 'bg-[#00a884]' };
    if (['ics'].includes(ext)) return { label: 'CAL', bg: 'bg-[#3498db]' };
    return { label: ext ? ext.toUpperCase().slice(0, 3) : 'FILE', bg: 'bg-[#7f8c8d]' };
  };

  // ── Document list ──
  const renderDocuments = () => {
    if (documents.length === 0) return null;
    return (
      <div className="space-y-1.5 mt-2">
        {documents.map((doc, idx) => {
          const docType = getDocStyle(doc.name);
          return (
            <div key={idx} className={cn('flex items-center gap-3 p-2.5 rounded-lg', isOwn ? 'bg-[#d9fdd3]/60 dark:bg-[#005c4b]/40' : 'bg-[#f0f2f5] dark:bg-[#202c33]')}>
              <div className={cn('flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-[10px] text-white', docType.bg)}>
                {docType.label}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[#111b21] dark:text-[#e9edef] truncate">{doc.name || 'Document'}</div>
                {doc.size && <div className="text-[11px] text-[#667781] dark:text-[#8696a0]">{formatSize(doc.size)}</div>}
              </div>
              <button onClick={() => downloadAttachment(doc)} className="flex-shrink-0 h-8 w-8 rounded-full bg-[#00a884]/10 flex items-center justify-center hover:bg-[#00a884]/20 transition-colors">
                <Download className="h-4 w-4 text-[#00a884]" />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-2">
        {hasMedia && renderMediaGrid()}
        {hasAudio && renderAudio()}
        {hasDocuments && renderDocuments()}
      </div>

      {/* Lightbox — full screen with carousel */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-none w-screen h-screen p-0 border-none bg-transparent shadow-none flex items-center justify-center">
          <VisuallyHidden>
            <DialogTitle>{mediaItems[currentIndex]?.name || `Media ${currentIndex + 1}`}</DialogTitle>
          </VisuallyHidden>

          {/* Close */}
          <Button size="icon" variant="ghost" onClick={() => setLightboxOpen(false)} className="fixed top-4 right-4 z-50 rounded-full bg-black/60 text-white hover:bg-black/80">
            <X className="h-5 w-5" />
          </Button>

          {/* Download */}
          {mediaItems[currentIndex] && (
            <a href={mediaItems[currentIndex].url} download={mediaItems[currentIndex].name} target="_blank" rel="noopener noreferrer" className="fixed top-4 left-4 z-50">
              <Button size="icon" variant="ghost" className="rounded-full bg-black/60 text-white hover:bg-black/80">
                <Download className="h-5 w-5" />
              </Button>
            </a>
          )}

          {/* Counter */}
          {mediaItems.length > 1 && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
              {currentIndex + 1} / {mediaItems.length}
            </div>
          )}

          {/* Navigation Arrows */}
          {mediaItems.length > 1 && (
            <>
              <Button size="icon" variant="ghost" onClick={prevItem} className="absolute left-4 top-1/2 -translate-y-1/2 z-40 rounded-full bg-black/60 text-white hover:bg-black/80 h-10 w-10">
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button size="icon" variant="ghost" onClick={nextItem} className="absolute right-4 top-1/2 -translate-y-1/2 z-40 rounded-full bg-black/60 text-white hover:bg-black/80 h-10 w-10">
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}

          {/* Media display */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center w-full h-full"
            >
              {(mediaItems[currentIndex]?.type === 'image' || mediaItems[currentIndex]?.mimeType?.startsWith('image/')) ? (
                <>
                  {lightboxLoading && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <Loader2 className="h-10 w-10 text-white animate-spin" />
                    </div>
                  )}
                  <ZoomableImage
                    src={mediaItems[currentIndex].url}
                    alt={mediaItems[currentIndex].name || 'Image'}
                    style={{ maxWidth: '96vw', maxHeight: '90vh', width: 'auto', height: 'auto' }}
                    onLoad={() => setLightboxLoading(false)}
                  />
                </>
              ) : (
                <video
                  src={mediaItems[currentIndex]?.url}
                  controls
                  autoPlay
                  className="object-contain"
                  style={{ maxWidth: '96vw', maxHeight: '96vh', width: 'auto', height: 'auto' }}
                  playsInline
                />
              )}
            </motion.div>
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </>
  );
}
