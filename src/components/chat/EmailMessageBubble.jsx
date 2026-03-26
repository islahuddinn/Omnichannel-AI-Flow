// src/components/chat/EmailMessageBubble.jsx
'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import MessageStatus from './MessageStatus';
import { Mail, Paperclip, Download, File, Image, FileText, FileSpreadsheet, FileCode, FileVideo, FileAudio, ChevronDown, ChevronUp, X, MoreHorizontal } from 'lucide-react';

const MAX_PREVIEW_LENGTH = 300; // Characters before showing "See More"

// Gmail-style attachment icon based on file type
const getAttachmentIcon = (mimeType, name) => {
  if (!mimeType && !name) return File;

  const type = mimeType?.toLowerCase() || '';
  const ext = name?.split('.').pop()?.toLowerCase() || '';

  if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
    return Image;
  }
  if (type.startsWith('video/') || ['mp4', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) {
    return FileVideo;
  }
  if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return FileAudio;
  }
  if (type.includes('pdf') || ext === 'pdf') {
    return FileText;
  }
  if (type.includes('spreadsheet') || type.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) {
    return FileSpreadsheet;
  }
  if (type.includes('text') || ['txt', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'xml'].includes(ext)) {
    return FileCode;
  }
  return File;
};

// Format file size
const formatFileSize = (bytes) => {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

/**
 * Parse email content to separate the main body from quoted/reply text.
 * Handles patterns like:
 *   - "On Mon, 9 Mar 2026 at 03:48, Name <email> wrote:" followed by "> quoted lines"
 *   - Lines starting with ">" (standard email quoting)
 *   - "-----Original Message-----" style separators
 *   - "From: ... Sent: ... To: ... Subject: ..." Outlook-style headers
 */
function parseEmailContent(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { mainBody: rawContent || '', quotedText: '', quotedSender: '' };
  }

  const lines = rawContent.split('\n');
  let splitIndex = -1;
  let quotedSender = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Pattern 1: "On <date>, <name> <email> wrote:"
    if (/^On\s+.+wrote:\s*$/i.test(line)) {
      // Extract sender name from "On ..., SenderName <email> wrote:"
      const senderMatch = line.match(/,\s*(.+?)\s*<[^>]+>\s*wrote:/i);
      if (senderMatch) {
        quotedSender = senderMatch[1].trim();
      }
      splitIndex = i;
      break;
    }

    // Pattern 2: "---------- Forwarded message ----------"
    if (/^-{3,}\s*(Forwarded message|Original Message)\s*-{3,}$/i.test(line)) {
      splitIndex = i;
      break;
    }

    // Pattern 3: "-----Original Message-----"
    if (/^-{3,}\s*Original Message\s*-{3,}$/i.test(line)) {
      splitIndex = i;
      break;
    }

    // Pattern 4: Outlook-style "From: ... Sent: ..." (only if preceded by empty line)
    if (/^From:\s+.+/i.test(line) && i > 0) {
      const prevLine = lines[i - 1].trim();
      // Check if next lines have Sent:/To:/Subject:
      if (prevLine === '' && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (/^(Sent|Date|To|Subject):\s+/i.test(nextLine)) {
          splitIndex = i;
          break;
        }
      }
    }

    // Pattern 5: Block of lines all starting with ">" (if we find 2+ consecutive quoted lines)
    if (line.startsWith('>') && i > 0) {
      // Check if previous non-empty line was not a ">" line (this is the start of quoting)
      let prevNonEmpty = i - 1;
      while (prevNonEmpty >= 0 && lines[prevNonEmpty].trim() === '') prevNonEmpty--;
      if (prevNonEmpty >= 0 && !lines[prevNonEmpty].trim().startsWith('>')) {
        splitIndex = i;
        break;
      }
    }
  }

  if (splitIndex === -1) {
    // No quoted text detected
    return { mainBody: rawContent.trim(), quotedText: '', quotedSender: '' };
  }

  const mainBody = lines.slice(0, splitIndex).join('\n').trim();
  const rawQuoted = lines.slice(splitIndex).join('\n').trim();

  // Clean quoted text: remove leading ">" characters and clean up
  const cleanedQuoted = rawQuoted
    .split('\n')
    .map(line => {
      // Remove leading > characters (and optional space after)
      return line.replace(/^(?:\s*>)+\s?/, '');
    })
    .join('\n')
    .trim();

  return { mainBody, quotedText: cleanedQuoted, quotedSender };
}

export default function EmailMessageBubble({
  message,
  isOwn,
  conversation
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);

  // Extract content
  const rawContent = typeof message.content === 'string'
    ? message.content
    : (message.content?.text || message.content || '');

  // Parse email content to separate main body from quoted text
  const { mainBody, quotedText, quotedSender } = useMemo(
    () => parseEmailContent(rawContent),
    [rawContent]
  );

  const needsTruncation = mainBody.length > MAX_PREVIEW_LENGTH;
  const displayContent = needsTruncation && !isExpanded
    ? mainBody.substring(0, MAX_PREVIEW_LENGTH) + '...'
    : mainBody;

  // Get email metadata
  const subject = message.emailData?.subject || message.subject || 'No Subject';
  const from = message.emailData?.from || 'Unknown';
  const to = message.emailData?.to || [];
  const cc = message.emailData?.cc || [];
  const bcc = message.emailData?.bcc || [];

  // Get channel account info - try multiple sources
  const channelAccount = message.channelAccount || message.metadata?.channelAccount;
  const accountName = channelAccount?.name || message.metadata?.channelName || conversation?.channelAccount?.name || null;
  const accountIdentifier = channelAccount?.identifier || message.metadata?.targetIdentifier || conversation?.channelAccount?.identifier || '';

  // Only show account info if we have it
  const showAccountInfo = accountName && accountName !== 'Unknown Account';

  // Format date
  const messageDate = new Date(message.createdAt);
  const timeString = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = messageDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: messageDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  });

  // Separate image and non-image attachments for better display
  const attachments = message.attachments || [];
  const imageAttachments = attachments.filter(att => {
    const type = att.mimeType?.toLowerCase() || '';
    const ext = att.name?.split('.').pop()?.toLowerCase() || '';
    return type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
  });
  const nonImageAttachments = attachments.filter(att => {
    const type = att.mimeType?.toLowerCase() || '';
    const ext = att.name?.split('.').pop()?.toLowerCase() || '';
    return !type.startsWith('image/') && !['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
  });

  return (
    <>
      {/* Image Lightbox Modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            onClick={() => setExpandedImage(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={expandedImage.url}
            alt={expandedImage.name || 'Image'}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div
        className={cn(
          'flex w-full mb-3',
          isOwn ? 'justify-end' : 'justify-start'
        )}
      >
        {/* Gmail-like Email Card */}
        <div
          className={cn(
            'rounded-lg border shadow-sm overflow-hidden',
            'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
            'hover:shadow-md transition-shadow',
            'w-full max-w-full sm:max-w-[90%] md:max-w-[85%] lg:max-w-[80%] xl:max-w-[75%]',
            'min-w-0' // Allow shrinking on small screens
          )}
        >
          {/* Email Header */}
          <div className={cn(
            'px-3 sm:px-4 py-3 border-b',
            'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
          )}>
            {/* Subject Row */}
            <div className="flex items-start justify-between mb-3 gap-2">
              <div className="flex-1 min-w-0">
                <h3 className={cn(
                  'text-sm sm:text-base font-medium mb-2 break-words',
                  'text-gray-900 dark:text-gray-100'
                )}>
                  {subject}
                </h3>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Status Icon */}
                {isOwn && (
                  <MessageStatus
                    status={message.status || 'pending'}
                    direction={message.direction}
                    channel="email"
                  />
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {dateString} at {timeString}
                </span>
              </div>
            </div>

            {/* From/To Info */}
            <div className="space-y-1.5 text-xs sm:text-sm">
              <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-400 font-medium min-w-[45px] sm:min-w-[50px] flex-shrink-0">
                  {isOwn ? 'To' : 'From'}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-900 dark:text-gray-100 break-words">
                    {isOwn
                      ? (to.join(', ') || message.contact?.name || message.contact?.identifier || conversation?.contact?.name || conversation?.contact?.displayName || conversation?.contact?.email || conversation?.contact?.identifier || 'Unknown')
                      : from}
                  </span>
                  {/* Show account info only if available */}
                  {showAccountInfo && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      via {accountName}{accountIdentifier ? ` (${accountIdentifier})` : ''}
                    </div>
                  )}
                </div>
              </div>

              {/* CC */}
              {cc.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 dark:text-gray-400 font-medium min-w-[45px] sm:min-w-[50px] flex-shrink-0">
                    Cc
                  </span>
                  <span className="text-gray-900 dark:text-gray-100 break-words flex-1">
                    {cc.join(', ')}
                  </span>
                </div>
              )}

              {/* BCC */}
              {isOwn && bcc.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 dark:text-gray-400 font-medium min-w-[45px] sm:min-w-[50px] flex-shrink-0">
                    Bcc
                  </span>
                  <span className="text-gray-900 dark:text-gray-100 break-words flex-1">
                    {bcc.join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Email Body */}
          <div className={cn(
            'px-3 sm:px-4 py-4',
            'bg-white dark:bg-gray-800',
            'text-gray-900 dark:text-gray-100'
          )}>
            {/* Reply Context */}
            {message.replyTo && (
              <div className={cn(
                'mb-3 pb-3 border-l-4 pl-3 text-xs',
                'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 rounded-r'
              )}>
                <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {message.replyTo.sender?.firstName || 'Unknown'}
                </div>
                <div className="text-gray-600 dark:text-gray-400 line-clamp-2">
                  {typeof message.replyTo.content === 'string'
                    ? message.replyTo.content
                    : (message.replyTo.content?.text || '[Media]')}
                </div>
              </div>
            )}

            {/* Main Message Content */}
            <div className={cn(
              'text-sm leading-relaxed whitespace-pre-wrap break-words',
              'text-gray-900 dark:text-gray-100'
            )}>
              {displayContent}

              {/* See More/Less Button */}
              {needsTruncation && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className={cn(
                    'ml-2 inline-flex items-center gap-1 text-sm font-medium',
                    'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300',
                    'transition-colors mt-2'
                  )}
                >
                  {isExpanded ? (
                    <>
                      <span>See Less</span>
                      <ChevronUp className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      <span>See More</span>
                      <ChevronDown className="h-4 w-4" />
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Quoted / Reply Thread Section */}
            {quotedText && (
              <div className="mt-3">
                <button
                  onClick={() => setShowQuoted(!showQuoted)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                    'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/60',
                    'hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300'
                  )}
                >
                  <MoreHorizontal className="h-3 w-3" />
                  {showQuoted ? 'Hide quoted text' : 'Show quoted text'}
                </button>

                {showQuoted && (
                  <div className={cn(
                    'mt-2 pl-3 border-l-2 border-gray-300 dark:border-gray-600'
                  )}>
                    {quotedSender && (
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                        {quotedSender} wrote:
                      </p>
                    )}
                    <div className={cn(
                      'text-sm leading-relaxed whitespace-pre-wrap break-words',
                      'text-gray-500 dark:text-gray-400'
                    )}>
                      {quotedText}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                {/* Attachments Header */}
                <div className="flex items-center gap-2 mb-3">
                  <Paperclip className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'}
                  </span>
                </div>

                {/* Image Attachments - Grid */}
                {imageAttachments.length > 0 && (
                  <div className="mb-4">
                    <div className={cn(
                      'grid gap-3',
                      imageAttachments.length === 1 ? 'grid-cols-1' :
                      imageAttachments.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
                      'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                    )}>
                      {imageAttachments.map((attachment, index) => (
                        <div
                          key={index}
                          className="group relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 hover:border-gray-300 dark:hover:border-gray-600 transition-all cursor-pointer"
                          onClick={() => setExpandedImage(attachment)}
                        >
                          {/* Image Thumbnail */}
                          <div className="relative aspect-video bg-gray-100 dark:bg-gray-800 overflow-hidden">
                            <img
                              src={attachment.url}
                              alt={attachment.name || `Image ${index + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              loading="lazy"
                            />
                            {/* Overlay on hover */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                              <Download className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                          {/* Image Info */}
                          <div className="p-2">
                            <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                              {attachment.name || `Image ${index + 1}`}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(attachment.size)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Non-Image Attachments - List */}
                {nonImageAttachments.length > 0 && (
                  <div className="space-y-2">
                    {nonImageAttachments.map((attachment, index) => {
                      const AttachmentIcon = getAttachmentIcon(attachment.mimeType, attachment.name);
                      const fileName = attachment.name || `Attachment ${index + 1}`;
                      const fileSize = formatFileSize(attachment.size);

                      return (
                        <a
                          key={index}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={fileName}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-lg border',
                            'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700',
                            'hover:bg-gray-100 dark:hover:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600',
                            'transition-all cursor-pointer group'
                          )}
                        >
                          {/* File Icon */}
                          <div className={cn(
                            'flex-shrink-0 w-10 h-10 rounded flex items-center justify-center',
                            'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          )}>
                            <AttachmentIcon className="h-5 w-5" />
                          </div>

                          {/* File Info */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {fileName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {fileSize}
                            </div>
                          </div>

                          {/* Download Icon */}
                          <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Download className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Email Footer - status if needed */}
          {isOwn && message.status && message.status !== 'sent' && (
            <div className={cn(
              'px-3 sm:px-4 py-2 border-t flex items-center justify-end',
              'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
            )}>
              <div className="flex items-center gap-2">
                <MessageStatus
                  status={message.status}
                  direction={message.direction}
                  channel="email"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {message.status}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
