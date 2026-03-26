// src/components/chat/AttachmentPreview.jsx
'use client';

import { X, FileText, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export default function AttachmentPreview({
  attachments,
  onRemove,
  totalSize,
  caption,
  onCaptionChange,
  className
}) {
  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getDocLabel = (name) => {
    const ext = (name || '').split('.').pop()?.toLowerCase() || '';
    // PDF
    if (ext === 'pdf') return { label: 'PDF', color: 'bg-[#e5252a]' };
    // Word
    if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) return { label: ext === 'odt' ? 'ODT' : ext === 'rtf' ? 'RTF' : 'DOC', color: 'bg-[#2b579a]' };
    // Excel
    if (['xls', 'xlsx', 'csv', 'ods', 'tsv'].includes(ext)) return { label: ext === 'csv' ? 'CSV' : ext === 'ods' ? 'ODS' : 'XLS', color: 'bg-[#217346]' };
    // PowerPoint
    if (['ppt', 'pptx', 'odp'].includes(ext)) return { label: ext === 'odp' ? 'ODP' : 'PPT', color: 'bg-[#d24726]' };
    // Archives
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'tgz'].includes(ext)) return { label: ext.toUpperCase().slice(0, 3), color: 'bg-[#f39c12]' };
    // Code
    if (['js', 'ts', 'py', 'java', 'cpp', 'go', 'rb', 'php', 'swift', 'kt', 'rs', 'sql', 'sh'].includes(ext)) return { label: ext.toUpperCase().slice(0, 3), color: 'bg-[#2ecc71]' };
    // Web
    if (['html', 'htm', 'css', 'xml', 'json', 'yaml', 'yml'].includes(ext)) return { label: ext.toUpperCase().slice(0, 4), color: 'bg-[#e74c3c]' };
    // Text
    if (['txt', 'log', 'md'].includes(ext)) return { label: ext.toUpperCase(), color: 'bg-[#7f8c8d]' };
    // Audio
    if (['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'].includes(ext)) return { label: ext.toUpperCase().slice(0, 3), color: 'bg-[#e67e22]' };
    // Video
    if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) return { label: ext.toUpperCase().slice(0, 3), color: 'bg-[#9b59b6]' };
    // Images
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext)) return { label: 'IMG', color: 'bg-[#8e44ad]' };
    // Executable / Installer
    if (['exe', 'msi', 'dmg', 'apk', 'deb'].includes(ext)) return { label: ext.toUpperCase().slice(0, 3), color: 'bg-[#c0392b]' };
    // Design
    if (['psd', 'ai', 'sketch', 'fig', 'xd'].includes(ext)) return { label: ext.toUpperCase().slice(0, 3), color: 'bg-[#00c8ff]' };
    // Fonts
    if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return { label: ext.toUpperCase().slice(0, 4), color: 'bg-[#34495e]' };
    // eBook
    if (['epub', 'mobi'].includes(ext)) return { label: ext.toUpperCase(), color: 'bg-[#8e44ad]' };
    // Fallback
    return { label: ext ? ext.toUpperCase().slice(0, 3) : 'FILE', color: 'bg-[#7f8c8d]' };
  };

  if (attachments.length === 0) return null;

  // Single attachment — WhatsApp-style large preview
  if (attachments.length === 1) {
    const attachment = attachments[0];
    const isImage = attachment.type === 'image' || attachment.mimeType?.startsWith('image/');
    const isVideo = attachment.type === 'video' || attachment.mimeType?.startsWith('video/');
    const isDocument = !isImage && !isVideo;

    return (
      <div className={cn('space-y-0', className)}>
        <div className="relative rounded-lg overflow-hidden border border-[#e9edef] dark:border-[#2a3942] bg-[#f0f2f5] dark:bg-[#111b21]">
          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
            onClick={() => onRemove(0)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>

          {/* Image preview */}
          {isImage && attachment.preview && (
            <div className="relative w-full max-h-64 bg-[#111b21] flex items-center justify-center">
              <img
                src={attachment.preview}
                alt={attachment.name}
                className="w-full h-auto max-h-64 object-contain"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                <div className="flex items-center justify-between text-white text-[11px]">
                  <span className="font-medium truncate mr-2">{attachment.name}</span>
                  <span className="flex-shrink-0">{formatSize(attachment.size)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Video preview */}
          {isVideo && attachment.preview && (
            <div className="relative w-full max-h-64 bg-[#111b21] flex items-center justify-center">
              <video src={attachment.preview} className="w-full h-auto max-h-64 object-contain" controls={false} muted playsInline />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-14 w-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                  <Play className="h-7 w-7 text-white ml-1" fill="white" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                <div className="flex items-center justify-between text-white text-[11px]">
                  <span className="font-medium truncate mr-2">{attachment.name}</span>
                  <span className="flex-shrink-0">{formatSize(attachment.size)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Document preview */}
          {isDocument && (
            <div className="p-4 flex items-center gap-3">
              {(() => {
                const doc = getDocLabel(attachment.name);
                return (
                  <div className={cn('h-11 w-11 rounded-lg flex items-center justify-center font-bold text-[10px] text-white flex-shrink-0', doc.color)}>
                    {doc.label}
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#111b21] dark:text-[#e9edef] truncate">{attachment.name}</p>
                <p className="text-[11px] text-[#667781] dark:text-[#8696a0] mt-0.5">{formatSize(attachment.size)}</p>
              </div>
            </div>
          )}

          {/* Status bar */}
          <div className="px-3 py-1.5 bg-[#f0f2f5] dark:bg-[#202c33] border-t border-[#e9edef] dark:border-[#2a3942]">
            <div className="flex items-center gap-1.5 text-[11px] text-[#667781] dark:text-[#8696a0]">
              <span className="font-medium">Attached</span>
              <span className="text-[#667781]/50">·</span>
              <span>{formatSize(totalSize || attachment.size)}</span>
              <span className="text-[#667781]/50">·</span>
              <span className="text-[#00a884] font-medium">Ready to send</span>
            </div>
          </div>
        </div>

        {/* Caption */}
        {onCaptionChange && (
          <div className="mt-2">
            <Textarea
              value={caption || ''}
              onChange={(e) => onCaptionChange(e.target.value)}
              placeholder="Add a caption..."
              className="resize-none min-h-[52px] text-sm border-[#e9edef] dark:border-[#2a3942]"
              rows={2}
            />
          </div>
        )}
      </div>
    );
  }

  // Multiple attachments — grid
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1.5 text-[11px] text-[#667781] dark:text-[#8696a0] mb-2">
        <span className="font-medium">{attachments.length} files attached</span>
        <span className="text-[#667781]/50">·</span>
        <span>{formatSize(totalSize || attachments.reduce((sum, a) => sum + (a.size || 0), 0))}</span>
        <span className="text-[#667781]/50">·</span>
        <span className="text-[#00a884] font-medium">Ready to send</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {attachments.map((attachment, index) => {
          const isImage = attachment.type === 'image' || attachment.mimeType?.startsWith('image/');
          const isVideo = attachment.type === 'video' || attachment.mimeType?.startsWith('video/');

          return (
            <div key={index} className="relative rounded-md overflow-hidden border border-[#e9edef] dark:border-[#2a3942] aspect-square bg-[#f0f2f5] dark:bg-[#202c33]">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-5 w-5 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
                onClick={() => onRemove(index)}
              >
                <X className="h-2.5 w-2.5" />
              </Button>
              {isImage && attachment.preview ? (
                <img
                  src={attachment.preview}
                  alt={attachment.name}
                  className="w-full h-full object-cover"
                />
              ) : isVideo && attachment.preview ? (
                <div className="relative w-full h-full">
                  <video src={attachment.preview} className="w-full h-full object-cover" muted playsInline />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="h-8 w-8 rounded-full bg-black/50 flex items-center justify-center">
                      <Play className="h-4 w-4 text-white ml-0.5" fill="white" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
                  {(() => {
                    const doc = getDocLabel(attachment.name);
                    return (
                      <div className={cn('h-8 w-8 rounded flex items-center justify-center font-bold text-[8px] text-white', doc.color)}>
                        {doc.label}
                      </div>
                    );
                  })()}
                  <span className="text-[9px] text-[#667781] dark:text-[#8696a0] truncate w-full text-center">{attachment.name}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {onCaptionChange && (
        <div className="mt-2">
          <Textarea
            value={caption || ''}
            onChange={(e) => onCaptionChange(e.target.value)}
            placeholder="Add a caption..."
            className="resize-none min-h-[52px] text-sm border-[#e9edef] dark:border-[#2a3942]"
            rows={2}
          />
        </div>
      )}
    </div>
  );
}
