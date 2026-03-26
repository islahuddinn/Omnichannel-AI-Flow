// src/components/webchat/WebChatVoicePlayer.jsx
/**
 * Voice Player Component for WebChat
 * WhatsApp-style voice message playback with waveform
 * Uses Howler.js for better audio quality and compatibility
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

export default function WebChatVoicePlayer({ audioUrl, duration, isOwn }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(null);
  const [howlLoaded, setHowlLoaded] = useState(false);
  const howlRef = useRef(null);
  const howlClassRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const { theme } = useTheme();

  // Dynamically import Howler.js only on client side
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    import('howler').then((module) => {
      howlClassRef.current = module.Howl;
      setHowlLoaded(true);
    }).catch((error) => {
      console.error('Failed to load Howler.js:', error);
    });
  }, []);

  useEffect(() => {
    // Only run on client side and when Howl is loaded
    if (typeof window === 'undefined' || !audioUrl || !howlLoaded || !howlClassRef.current) return;

    // Cleanup previous Howl instance
    if (howlRef.current) {
      howlRef.current.unload();
      howlRef.current = null;
    }

    // Reset state
    setCurrentTime(0);
    setIsPlaying(false);
    setAudioDuration(null);

    // Convert S3 URL to proxy URL if it's an S3 URL (to avoid CORS issues)
    // Use regex instead of URL constructor to avoid SSR issues
    let proxyUrl = audioUrl;
    if (audioUrl && typeof audioUrl === 'string' && audioUrl.includes('s3.') && audioUrl.includes('amazonaws.com')) {
      try {
        // Extract key using regex (works in both browser and server)
        // Pattern: https://bucket.s3.region.amazonaws.com/uploads/tenantId/filename
        const match = audioUrl.match(/s3\.[^/]+\.amazonaws\.com\/(.+?)(?:\?|$)/);
        if (match && match[1]) {
          const key = match[1];
          proxyUrl = `/api/media/${key}`;
        }
      } catch (e) {
        console.warn('Failed to parse S3 URL:', e);
        // Keep original URL if parsing fails
      }
    }

    // Create new Howl instance with proxy URL
    howlRef.current = new howlClassRef.current({
      src: [proxyUrl],
      format: ['webm', 'ogg', 'mp3', 'wav'],
      html5: false, // Use Web Audio API to avoid HTML5 pool exhaustion
      volume: 1.0,
      rate: 1.0, // Normal playback speed - critical for clear audio
      onload: () => {
        const dur = howlRef.current.duration();
        if (dur && isFinite(dur) && !isNaN(dur) && dur > 0) {
          setAudioDuration(dur);
        } else if (duration && isFinite(duration) && !isNaN(duration) && duration > 0) {
          setAudioDuration(duration);
        }
      },
      onplay: () => {
        setIsPlaying(true);
        // Start progress tracking
        progressIntervalRef.current = setInterval(() => {
          if (howlRef.current) {
            const time = howlRef.current.seek();
            if (typeof time === 'number' && isFinite(time) && !isNaN(time)) {
              setCurrentTime(time);
            }
          }
        }, 100);
      },
      onpause: () => {
        setIsPlaying(false);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      },
      onend: () => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      },
      onerror: (id, error) => {
        console.error('Howler error:', error);
        setIsPlaying(false);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      }
    });

    // Get duration when loaded
    if (howlRef.current.state() === 'loaded') {
      const dur = howlRef.current.duration();
      if (dur && isFinite(dur) && !isNaN(dur) && dur > 0) {
        setAudioDuration(dur);
      } else if (duration && isFinite(duration) && !isNaN(duration) && duration > 0) {
        setAudioDuration(duration);
      }
    }

    return () => {
      if (howlRef.current) {
        howlRef.current.unload();
        howlRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [audioUrl, duration, howlLoaded]);

  const togglePlay = () => {
    if (!howlRef.current) return;

    try {
      if (isPlaying) {
        howlRef.current.pause();
        setIsPlaying(false);
      } else {
        // Ensure playback rate is 1.0
        howlRef.current.rate(1.0);
        howlRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Playback error:', error);
      setIsPlaying(false);
    }
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
      return '0:00';
    }
    // Round to nearest second (ignore milliseconds)
    const totalSeconds = Math.round(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Use audioDuration if available, otherwise fallback to provided duration
  const displayDuration = audioDuration !== null 
    ? (isFinite(audioDuration) && !isNaN(audioDuration) ? audioDuration : duration)
    : (duration && isFinite(duration) && !isNaN(duration) ? duration : 0);

  const progress = displayDuration > 0 ? Math.min(100, Math.max(0, (currentTime / displayDuration) * 100)) : 0;

  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-xl',
      isOwn
        ? 'bg-white/20 dark:bg-white/10'
        : 'bg-gray-100 dark:bg-gray-700'
    )}>
      {/* Play/Pause Button */}
      <motion.button
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
        className={cn(
          'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors',
          isOwn
            ? 'bg-white/30 dark:bg-white/20 hover:bg-white/40 text-white'
            : 'bg-purple-600 dark:bg-purple-500 hover:bg-purple-700 dark:hover:bg-purple-600 text-white'
        )}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" />
        )}
      </motion.button>

      {/* Waveform and Progress */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* Progress Bar - clickable to seek */}
        <div
          className="relative cursor-pointer group"
          role="slider"
          aria-label="Audio progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          onClick={(e) => {
            if (!howlRef.current || !displayDuration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(1, clickX / rect.width));
            const seekTime = percentage * displayDuration;
            howlRef.current.seek(seekTime);
            setCurrentTime(seekTime);
          }}
        >
          <div
            className={cn(
              'h-1.5 rounded-full overflow-hidden group-hover:h-2.5 transition-all',
              isOwn
                ? 'bg-white/30 dark:bg-white/20'
                : 'bg-gray-300 dark:bg-gray-600'
            )}
          >
            <motion.div
              className={cn(
                'h-full rounded-full transition-all',
                isOwn
                  ? 'bg-white dark:bg-white'
                  : 'bg-purple-600 dark:bg-purple-400'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.1, ease: 'linear' }}
            />
          </div>
        </div>

        {/* Time Display with better formatting */}
        <div className={cn(
          'flex items-center justify-between text-xs font-medium',
          isOwn
            ? 'text-white/90 dark:text-white/80'
            : 'text-gray-700 dark:text-gray-200'
        )}>
          <span className="font-mono">{formatTime(currentTime)}</span>
          <span className="font-mono opacity-70">/ {formatTime(displayDuration)}</span>
        </div>
      </div>
    </div>
  );
}
