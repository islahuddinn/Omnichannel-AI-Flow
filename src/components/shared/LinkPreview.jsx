// src/components/shared/LinkPreview.jsx
'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Common file extensions - link preview is for web pages, not files */
const FILE_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|csv|png|jpg|jpeg|gif|webp|mp4|mov|mp3|wav|webm)(\?|$|\/)/i;

/**
 * True if URL points to a file (document/image/video etc). We show document cards for these, not link preview.
 */
export function isFileUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    const path = (u.pathname || '').toLowerCase();
    const host = (u.hostname || '').toLowerCase();
    return FILE_EXTENSIONS.test(path) || FILE_EXTENSIONS.test(host);
  } catch {
    return /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|csv|png|jpg|jpeg|gif|webp|mp4|mov|mp3|wav|webm)(\?|$)/i.test(url);
  }
}

/**
 * Utility function to detect URLs in text
 */
export function detectUrls(text) {
  if (!text || typeof text !== 'string') return [];
  
  // Regex to match URLs (http, https, www, or just domain)
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/gi;
  const matches = text.match(urlRegex);
  
  if (!matches) return [];
  
  // Normalize URLs (add https:// if missing)
  return matches.map(url => {
    let normalizedUrl = url.trim();
    // Remove trailing punctuation that might not be part of URL
    normalizedUrl = normalizedUrl.replace(/[.,;:!?]+$/, '');
    
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    return normalizedUrl;
  });
}

/**
 * Utility function to render text with clickable links
 */
export function renderTextWithLinks(text, isOwn = false) {
  if (!text || typeof text !== 'string') return text;
  
  const urls = detectUrls(text);
  if (urls.length === 0) return text;
  
  // Split text by URLs and create React elements
  const parts = [];
  let lastIndex = 0;
  
  urls.forEach((url, index) => {
    // Find the original URL in text (might have different format)
    const urlPattern = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    const regex = new RegExp(`(https?://)?(www\\.)?${urlPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
    const match = text.substring(lastIndex).match(regex);
    
    if (match) {
      const matchIndex = text.indexOf(match[0], lastIndex);
      
      // Add text before URL
      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }
      
      // Add clickable link
      parts.push(
        <a
          key={`link-${index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "underline break-all",
            isOwn
              ? "text-primary dark:text-white/90 hover:text-primary/80 dark:hover:text-white"
              : "text-primary hover:text-primary/80"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {match[0]}
        </a>
      );
      
      lastIndex = matchIndex + match[0].length;
    }
  });
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

/**
 * LinkPreview Component - WhatsApp-style link card
 */
export default function LinkPreview({ url, isOwn = false, className }) {
  const [domain, setDomain] = useState('');
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    try {
      const urlObj = new URL(url);
      setDomain(urlObj.hostname.replace(/^www\./, ''));
    } catch (e) {
      setDomain(url);
    }
  }, [url]);

  /** Display URL without protocol; for file-like URLs show only filename (no https://) */
  const displayUrl = (() => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname || '';
      const decodedPath = decodeURIComponent(pathname);
      const lastSegment = decodedPath.split('/').filter(Boolean).pop() || '';
      const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(lastSegment);
      if (hasFileExtension && lastSegment) return lastSegment;
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    } catch (e) {
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    }
  })();

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className={cn(
        "mt-2 rounded-lg overflow-hidden border cursor-pointer transition-all duration-200",
        isOwn 
          ? "bg-white dark:bg-white/10 border-gray-300/60 dark:border-white/20 hover:bg-gray-50 dark:hover:bg-white/15 shadow-sm" 
          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750",
        isHovered && "shadow-md",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          <div className={cn(
            "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
            isOwn 
              ? "bg-gray-100 dark:bg-white/20"
              : "bg-primary/10 dark:bg-primary/15"
          )}>
            <Globe className={cn(
              "w-5 h-5",
              isOwn ? "text-gray-700 dark:text-white" : "text-primary"
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={cn(
              "text-sm font-medium truncate mb-0.5",
              isOwn ? "text-gray-900 dark:text-white" : "text-gray-900 dark:text-gray-100"
            )}>
              {domain}
            </div>
            <div className={cn(
              "text-xs truncate flex items-center gap-1",
              isOwn ? "text-gray-600 dark:text-white/70" : "text-gray-500 dark:text-gray-400"
            )}>
              <span className="truncate" title={url}>{displayUrl}</span>
              <ExternalLink className={cn(
                "w-3 h-3 flex-shrink-0",
                isOwn ? "text-gray-500 dark:text-white/70" : "text-gray-400 dark:text-gray-500"
              )} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

