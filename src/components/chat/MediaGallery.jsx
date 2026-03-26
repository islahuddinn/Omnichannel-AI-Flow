// src/components/chat/MediaGallery.jsx
// WhatsApp-style "Media, Links, and Docs" panel
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Image as ImageIcon, FileText, Link2, Play, Download, ExternalLink, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/client';
import ZoomableImage from './ZoomableImage';

const TABS = [
  { key: 'media', label: 'Media', icon: ImageIcon },
  { key: 'documents', label: 'Docs', icon: FileText },
  { key: 'links', label: 'Links', icon: Link2 },
];

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getDocStyle(name) {
  const ext = (name || '').split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return { label: 'PDF', bg: 'bg-[#e5252a]' };
  if (['doc', 'docx'].includes(ext)) return { label: 'DOC', bg: 'bg-[#2b579a]' };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: 'XLS', bg: 'bg-[#217346]' };
  if (['ppt', 'pptx'].includes(ext)) return { label: 'PPT', bg: 'bg-[#d24726]' };
  if (['zip', 'rar', '7z'].includes(ext)) return { label: ext.toUpperCase(), bg: 'bg-[#f39c12]' };
  return { label: ext ? ext.toUpperCase().slice(0, 3) : 'FILE', bg: 'bg-[#7f8c8d]' };
}

export default function MediaGallery({ conversationId, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('media');
  const [lightbox, setLightbox] = useState(null); // { url, type, name }

  const { data, isLoading } = useQuery({
    queryKey: ['media-gallery', conversationId],
    queryFn: () => apiClient.get(`/conversations/${conversationId}/media`),
    enabled: isOpen && !!conversationId,
    staleTime: 30000,
  });

  const gallery = data?.data;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md max-h-[80vh] p-0 flex flex-col">
          <VisuallyHidden><DialogTitle>Media, Links and Docs</DialogTitle></VisuallyHidden>

          {/* Header */}
          <div className="px-4 pt-4 pb-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-[#111b21] dark:text-[#e9edef]">Media, Links, and Docs</h3>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#e9edef] dark:border-[#2a3942]">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 pb-2.5 text-[13px] font-medium transition-colors border-b-2',
                    activeTab === tab.key
                      ? 'text-[#00a884] border-[#00a884]'
                      : 'text-[#667781] dark:text-[#8696a0] border-transparent hover:text-[#111b21] dark:hover:text-[#e9edef]'
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                  {gallery?.counts?.[tab.key] > 0 && (
                    <span className="text-[10px] bg-[#00a884]/10 text-[#00a884] rounded-full px-1.5">
                      {gallery.counts[tab.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#00a884]" />
              </div>
            ) : (
              <>
                {/* Media Grid */}
                {activeTab === 'media' && (
                  (gallery?.media?.length || 0) > 0 ? (
                    <div className="grid grid-cols-3 gap-1">
                      {gallery.media.map((item, idx) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-md overflow-hidden cursor-pointer hover:opacity-90 transition-opacity relative group bg-[#e4e6e8] dark:bg-[#2a3942]"
                          onClick={() => setLightbox(item)}
                        >
                          {(item.type === 'video') ? (
                            <>
                              <video src={item.url} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <Play className="h-6 w-6 text-white" fill="white" />
                              </div>
                              {item.duration && (
                                <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1 py-0.5 rounded">
                                  {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
                                </div>
                              )}
                            </>
                          ) : (
                            <img src={item.url} alt={item.name || ''} className="w-full h-full object-cover" loading="lazy" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-[13px] text-[#667781]">No media shared yet</div>
                  )
                )}

                {/* Documents List */}
                {activeTab === 'documents' && (
                  (gallery?.documents?.length || 0) > 0 ? (
                    <div className="space-y-1.5">
                      {gallery.documents.map((doc, idx) => {
                        const ds = getDocStyle(doc.name);
                        return (
                          <a
                            key={idx}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#f0f2f5] dark:hover:bg-[#202c33] transition-colors"
                          >
                            <div className={cn('flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[9px] text-white', ds.bg)}>
                              {ds.label}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-[#111b21] dark:text-[#e9edef] truncate">{doc.name}</p>
                              <div className="flex items-center gap-1.5 text-[11px] text-[#667781] dark:text-[#8696a0]">
                                {doc.size && <span>{formatSize(doc.size)}</span>}
                                {doc.size && doc.createdAt && <span>·</span>}
                                {doc.createdAt && <span>{formatDate(doc.createdAt)}</span>}
                              </div>
                            </div>
                            <Download className="h-4 w-4 text-[#667781] flex-shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-[13px] text-[#667781]">No documents shared yet</div>
                  )
                )}

                {/* Links List */}
                {activeTab === 'links' && (
                  (gallery?.links?.length || 0) > 0 ? (
                    <div className="space-y-1.5">
                      {gallery.links.map((link, idx) => (
                        <a
                          key={idx}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-[#f0f2f5] dark:hover:bg-[#202c33] transition-colors"
                        >
                          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#00a884]/10 flex items-center justify-center">
                            <Link2 className="h-4 w-4 text-[#00a884]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-[#00a884] truncate">{link.url}</p>
                            {link.text && link.text !== link.url && (
                              <p className="text-[11px] text-[#667781] dark:text-[#8696a0] truncate mt-0.5">{link.text}</p>
                            )}
                            {link.createdAt && (
                              <p className="text-[10px] text-[#667781]/60 mt-0.5">{formatDate(link.createdAt)}</p>
                            )}
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-[#667781] flex-shrink-0 mt-1" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-[13px] text-[#667781]">No links shared yet</div>
                  )
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Media Lightbox */}
      {lightbox && (
        <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
          <DialogContent className="max-w-none w-screen h-screen p-0 border-none bg-transparent shadow-none flex items-center justify-center">
            <VisuallyHidden><DialogTitle>Preview</DialogTitle></VisuallyHidden>
            <Button size="icon" variant="ghost" onClick={() => setLightbox(null)} className="fixed top-4 right-4 z-50 rounded-full bg-black/60 text-white hover:bg-black/80">
              <X className="h-5 w-5" />
            </Button>
            <a href={lightbox.url} download={lightbox.name} target="_blank" rel="noopener noreferrer" className="fixed top-4 left-4 z-50">
              <Button size="icon" variant="ghost" className="rounded-full bg-black/60 text-white hover:bg-black/80">
                <Download className="h-5 w-5" />
              </Button>
            </a>
            {lightbox.type === 'video' ? (
              <video src={lightbox.url} controls autoPlay className="object-contain" style={{ maxWidth: '96vw', maxHeight: '96vh' }} playsInline />
            ) : (
              <ZoomableImage src={lightbox.url} alt={lightbox.name || ''} style={{ maxWidth: '96vw', maxHeight: '90vh' }} />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
