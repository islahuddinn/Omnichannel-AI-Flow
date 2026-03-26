'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function VoicePlayer({ audioUrl, duration, isOwn }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const audioRef = useRef(null);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
    const totalSeconds = Math.floor(seconds);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // WhatsApp-style waveform bars (consistent per audio URL)
  const waveformBars = useMemo(() => {
    const barCount = 40;
    const bars = [];
    const seed = audioUrl ? audioUrl.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
    for (let i = 0; i < barCount; i++) {
      const pseudoRandom = Math.abs(Math.sin((seed + i) * 12.9898 + i * 78.233) * 10000);
      const normalized = (pseudoRandom - Math.floor(pseudoRandom));
      const height = normalized * 0.55 + 0.25; // 25-80% height
      bars.push(height);
    }
    return bars;
  }, [audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    setIsLoading(true);
    setHasError(false);
    audio.src = audioUrl;
    audio.preload = 'metadata';

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) setAudioDuration(audio.duration);
      else if (duration) setAudioDuration(duration);
      setIsLoading(false);
    };
    const handleCanPlay = () => setIsLoading(false);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const handleError = () => {
      setHasError(true);
      setIsLoading(false);
      if (duration) setAudioDuration(duration);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.load();

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioUrl, duration]);

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (isPlaying) { audio.pause(); setIsPlaying(false); }
      else { await audio.play(); setIsPlaying(true); }
    } catch { setIsPlaying(false); }
  };

  // Playback speed toggle: 1x → 1.5x → 2x → 1x
  const cycleSpeed = () => {
    const speeds = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const newSpeed = speeds[nextIdx];
    setPlaybackSpeed(newSpeed);
    if (audioRef.current) audioRef.current.playbackRate = newSpeed;
  };

  // Waveform click-to-seek
  const handleWaveformClick = (e) => {
    const audio = audioRef.current;
    if (!audio || !audioDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    audio.currentTime = ratio * audioDuration;
    setCurrentTime(audio.currentTime);
  };

  const progress = audioDuration > 0 ? currentTime / audioDuration : 0;
  const activeBarCount = Math.floor(progress * waveformBars.length);

  if (!audioUrl) {
    return (
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
        isOwn ? 'text-[#111b21] dark:text-[#e9edef]' : 'text-[#667781] dark:text-[#8696a0]'
      )}>
        <span>Audio not available</span>
      </div>
    );
  }

  return (
    <div className={cn(
      'flex items-center gap-2 px-2 py-1.5 rounded-lg w-[280px]',
    )}>
      <audio ref={audioRef} className="hidden" />

      {/* Play/Pause — WhatsApp uses teal green circle */}
      <button
        onClick={handlePlayPause}
        disabled={isLoading}
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95',
          isOwn
            ? 'bg-[#00a884] hover:bg-[#008f72] text-white'
            : 'bg-[#00a884] hover:bg-[#008f72] text-white',
          isLoading && 'opacity-50 cursor-wait'
        )}
        type="button"
        aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform + Duration */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center py-1">
          <div className="flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-[#667781]" />
            <span className="text-[11px] text-[#667781] dark:text-[#8696a0]">Loading...</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          {/* Clickable waveform */}
          <div
            className="flex items-center gap-[1.5px] h-[28px] cursor-pointer"
            onClick={handleWaveformClick}
          >
            {waveformBars.map((height, index) => {
              const isActive = index < activeBarCount;
              return (
                <div
                  key={index}
                  className={cn(
                    'flex-1 rounded-full transition-colors duration-75',
                    isOwn
                      ? isActive
                        ? 'bg-[#00a884]'
                        : 'bg-[#b3d6c5] dark:bg-[#2e6e55]'
                      : isActive
                        ? 'bg-[#00a884]'
                        : 'bg-[#c9cdd0] dark:bg-[#4a5963]'
                  )}
                  style={{
                    height: `${Math.max(height * 100, 15)}%`,
                    minHeight: '3px',
                  }}
                />
              );
            })}
          </div>
          {/* Duration + Speed */}
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10.5px] text-[#667781] dark:text-[#8696a0] tabular-nums">
              {formatTime(isPlaying ? currentTime : audioDuration)}
            </span>
            {/* Playback speed — visible only while playing */}
            {isPlaying && (
              <button
                onClick={cycleSpeed}
                className="text-[10px] font-bold text-[#00a884] bg-[#00a884]/10 rounded px-1.5 py-0.5 hover:bg-[#00a884]/20 transition-colors"
                type="button"
              >
                {playbackSpeed}x
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
