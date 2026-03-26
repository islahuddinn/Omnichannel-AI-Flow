// src/components/webchat/WebChatVoiceRecorder.jsx
/**
 * Voice Recorder Component for WebChat
 * WhatsApp-style voice message recording with pause/play/delete
 * Uses RecordRTC for better audio quality and compatibility
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Pause, Play, Send, Trash2, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import RecordRTC from 'recordrtc';

export default function WebChatVoiceRecorder({ onSend, onCancel }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false); // ✅ Indicator for ready to listen
  const [micError, setMicError] = useState(null); // ✅ Track mic access errors for retry
  
  const recordRTCRef = useRef(null);
  const audioElementRef = useRef(null);
  const intervalRef = useRef(null);
  const visualizationRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const visualizationAnimationRef = useRef(null);
  const recordingStartTimeRef = useRef(0);
  const pausedTimeRef = useRef(0);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const { theme } = useTheme();

  // Auto-start recording when component mounts
  useEffect(() => {
    startRecording();
    
    return () => {
      cleanup();
    };
  }, []);

  // Update visualization when recording state changes
  useEffect(() => {
    if (isRecording && !isPaused) {
      visualizeAudio();
    } else {
      // Stop visualization animation
      if (visualizationAnimationRef.current) {
        cancelAnimationFrame(visualizationAnimationRef.current);
        visualizationAnimationRef.current = null;
      }
      // Clear canvas when paused
      if (visualizationRef.current) {
        const canvas = visualizationRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [isRecording, isPaused]);

  const cleanup = () => {
    // Stop timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Stop visualization animation
    if (visualizationAnimationRef.current) {
      cancelAnimationFrame(visualizationAnimationRef.current);
      visualizationAnimationRef.current = null;
    }
    
    // Stop RecordRTC
    if (recordRTCRef.current) {
      try {
        recordRTCRef.current.stopRecording();
        recordRTCRef.current.destroy();
      } catch (e) {
        console.warn('Error stopping RecordRTC:', e);
      }
      recordRTCRef.current = null;
    }
    
    // Stop audio context
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      } catch (e) {
        console.warn('Error closing audio context:', e);
      }
      audioContextRef.current = null;
    }
    
    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    
    // ✅ Stop audio playback first
    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.src = '';
        // Remove all event listeners to prevent memory leaks
        audioElementRef.current.oncanplay = null;
        audioElementRef.current.onplay = null;
        audioElementRef.current.onended = null;
        audioElementRef.current.onerror = null;
        audioElementRef.current = null;
      } catch (e) {
        console.warn('Error cleaning up audio element:', e);
      }
    }
    
    // ✅ Cleanup audio URL last (after audio element is cleaned up)
    if (audioUrl && typeof window !== 'undefined' && typeof URL !== 'undefined') {
      try {
        URL.revokeObjectURL(audioUrl);
      } catch (e) {
        console.warn('Error revoking URL:', e);
      }
      setAudioUrl(null);
    }
  };

  const startRecording = async () => {
    try {
      // ✅ Simplified audio constraints - only use well-supported options
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // ✅ Don't force sampleRate/channelCount - let browser choose optimal settings
        },
      });

      streamRef.current = audioStream;
      recordingStartTimeRef.current = Date.now();
      pausedTimeRef.current = 0;

      // Setup audio visualization
      try {
        // ✅ Don't force sampleRate - use browser default
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(audioStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
        source.connect(analyser);
      } catch (e) {
        console.warn('Audio visualization not supported:', e);
      }

      // ✅ Use RecordRTC with minimal options for better compatibility
      const options = {
        type: 'audio',
        mimeType: 'audio/webm;codecs=opus',
        // ✅ Don't force sampleRate or channelCount - let RecordRTC use optimal settings
        // ✅ Remove timeSlice to avoid breaking voice with too frequent chunks
        // timeSlice: 100, // REMOVED - causes voice breaking
      };

      recordRTCRef.current = new RecordRTC(audioStream, options);
      
      // Set refs immediately for timer
      isRecordingRef.current = true;
      isPausedRef.current = false;
      
      setIsRecording(true);
      setIsPaused(false);

      // Start recording
      recordRTCRef.current.startRecording();

      // ✅ Start duration timer - ensure only one interval is running
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(() => {
        if (isRecordingRef.current && !isPausedRef.current) {
          const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current - pausedTimeRef.current) / 1000);
          setDuration(elapsed);
        }
      }, 1000); // ✅ Changed from 100ms to 1000ms (1 second) for regular counting

    } catch (error) {
      console.error('Recording error:', error);
      let errorMsg;
      if (error.name === 'NotAllowedError') {
        errorMsg = 'Microphone permission denied';
      } else if (error.name === 'NotFoundError') {
        errorMsg = 'No microphone found';
      } else {
        errorMsg = 'Could not access microphone';
      }
      toast.error(errorMsg);
      setMicError(errorMsg);
    }
  };

  const visualizeAudio = () => {
    if (!analyserRef.current || !visualizationRef.current) return;
    if (!isRecording || isPaused) return;
    
    const draw = () => {
      if (!analyserRef.current || !visualizationRef.current || !isRecording || isPaused) {
        visualizationAnimationRef.current = null;
        return;
      }

      const canvas = visualizationRef.current;
      const canvasCtx = canvas.getContext('2d');
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      analyserRef.current.getByteFrequencyData(dataArray);

      // Clear canvas
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw waveform bars
      const barWidth = Math.max(2, (canvas.width / bufferLength) * 2);
      const barGap = 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i += 2) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
        const isDark = theme === 'dark';
        canvasCtx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.6)';
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + barGap;
      }

      visualizationAnimationRef.current = requestAnimationFrame(draw);
    };

    visualizationAnimationRef.current = requestAnimationFrame(draw);
  };

  // ✅ Helper function to get actual audio duration from blob (must be defined before use)
  const getAudioDuration = async (blob) => {
    if (!blob || blob.size === 0) return 0;
    
    try {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      return new Promise((resolve) => {
        audio.addEventListener('loadedmetadata', () => {
          const duration = audio.duration;
          URL.revokeObjectURL(url);
          if (duration && isFinite(duration) && !isNaN(duration) && duration > 0) {
            resolve(Math.floor(duration));
          } else {
            // Fallback to timer duration
            resolve(Math.floor((Date.now() - recordingStartTimeRef.current - pausedTimeRef.current) / 1000));
          }
        });
        
        audio.addEventListener('error', () => {
          URL.revokeObjectURL(url);
          // Fallback to timer duration
          resolve(Math.floor((Date.now() - recordingStartTimeRef.current - pausedTimeRef.current) / 1000));
        });
        
        // Timeout after 2 seconds
        setTimeout(() => {
          URL.revokeObjectURL(url);
          resolve(Math.floor((Date.now() - recordingStartTimeRef.current - pausedTimeRef.current) / 1000));
        }, 2000);
        
        audio.load();
      });
    } catch (error) {
      console.warn('Error getting audio duration:', error);
      // Fallback to timer duration
      return Math.floor((Date.now() - recordingStartTimeRef.current - pausedTimeRef.current) / 1000);
    }
  };

  const pauseRecording = async () => {
    if (recordRTCRef.current && isRecording) {
      // ✅ Stop recording completely (no resume functionality)
      recordRTCRef.current.stopRecording(async () => {
        try {
          const blob = recordRTCRef.current.getBlob();
          if (blob && blob.size > 0) {
            setAudioBlob(blob);
            if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
              const url = URL.createObjectURL(blob);
              setAudioUrl(url);
            }
            
            // ✅ Get actual audio duration from blob immediately
            const actualDuration = await getAudioDuration(blob);
            setDuration(actualDuration); // Update duration with actual audio duration
            
            setIsAudioReady(true); // ✅ Mark as ready to listen
          } else {
            setIsAudioReady(false);
          }
        } catch (e) {
          console.warn('Could not get blob while pausing:', e);
          setIsAudioReady(false);
        }
      });
      
      // Update refs for timer
      isRecordingRef.current = false;
      isPausedRef.current = true;
      
      setIsPaused(true);
      setIsRecording(false);
      
      // ✅ Stop timer immediately and clear reference
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // Stop visualization
      if (visualizationAnimationRef.current) {
        cancelAnimationFrame(visualizationAnimationRef.current);
        visualizationAnimationRef.current = null;
      }
      
      // ✅ Try to get blob immediately if available
      try {
        const immediateBlob = recordRTCRef.current.getBlob();
        if (immediateBlob && immediateBlob.size > 0) {
          setAudioBlob(immediateBlob);
          if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
            const url = URL.createObjectURL(immediateBlob);
            setAudioUrl(url);
          }
          
          // ✅ Get actual audio duration from blob immediately
          const actualDuration = await getAudioDuration(immediateBlob);
          setDuration(actualDuration); // Update duration with actual audio duration
          
          setIsAudioReady(true);
        }
      } catch (e) {
        // Blob will come from callback
      }
    }
  };

  const stopRecording = () => {
    if (recordRTCRef.current) {
      recordRTCRef.current.stopRecording(() => {
        const blob = recordRTCRef.current.getBlob();
        setAudioBlob(blob);
        if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
        }
      });
    }
    
    setIsRecording(false);
    setIsPaused(false);
    
    // Stop timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Stop visualization
    if (visualizationAnimationRef.current) {
      cancelAnimationFrame(visualizationAnimationRef.current);
      visualizationAnimationRef.current = null;
    }
    
    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const playPreview = async () => {
    try {
      // ✅ Stop any currently playing audio first
      if (audioElementRef.current && !audioElementRef.current.paused) {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
      }
      
      let blobToPlay = audioBlob;
      
      if (!blobToPlay && recordRTCRef.current) {
        // Get blob from RecordRTC
        try {
          blobToPlay = recordRTCRef.current.getBlob();
          if (blobToPlay && blobToPlay.size > 0) {
            setAudioBlob(blobToPlay);
          }
        } catch (e) {
          console.warn('Could not get blob from RecordRTC:', e);
        }
      }
      
      if (blobToPlay && blobToPlay.size > 0 && typeof window !== 'undefined' && typeof URL !== 'undefined') {
        // ✅ Revoke old URL if exists
        if (audioUrl) {
          try {
            URL.revokeObjectURL(audioUrl);
          } catch (e) {
            // Ignore errors
          }
        }
        
        // ✅ Create new URL for this playback session
        const url = URL.createObjectURL(blobToPlay);
        setAudioUrl(url);

        // ✅ Create new audio element for each playback (prevents errors)
        if (audioElementRef.current) {
          audioElementRef.current.pause();
          audioElementRef.current.src = '';
        }
        
        const audio = new Audio();
        audio.playbackRate = 1.0;
        audioElementRef.current = audio;
        
        // ✅ Set up event handlers before setting src
        audio.oncanplay = () => {
          setIsAudioReady(true);
        };
        
        audio.onplay = () => {
          setIsPlaying(true);
          setIsAudioReady(true);
        };
        
        audio.onended = () => {
          setIsPlaying(false);
          // Don't revoke URL here - might need it for replay
        };
        
        audio.onerror = (e) => {
          console.error('Audio playback error:', e);
          setIsPlaying(false);
          setIsAudioReady(false);
          // Don't revoke URL on error - might be recoverable
          toast.error('Failed to play recording');
        };
        
        // ✅ Set src after handlers are set up
        audio.src = url;
        audio.load(); // Load the audio
        
        // ✅ Wait a bit for metadata to load
        await new Promise((resolve) => {
          if (audio.readyState >= 2) { // HAVE_CURRENT_DATA
            resolve();
          } else {
            audio.addEventListener('loadedmetadata', () => resolve(), { once: true });
            setTimeout(resolve, 1000); // Timeout after 1 second
          }
        });
        
        // ✅ Now try to play
        try {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            await playPromise;
            setIsPlaying(true);
            setIsAudioReady(true);
          }
        } catch (error) {
          console.error('Play error:', error);
          setIsPlaying(false);
          setIsAudioReady(false);
          toast.error('Failed to play recording');
        }
      } else if (!blobToPlay || blobToPlay.size === 0) {
        toast.error('Audio not ready yet');
        setIsAudioReady(false);
      }
    } catch (error) {
      console.error('Playback error:', error);
      toast.error('Failed to play recording');
      setIsPlaying(false);
      setIsAudioReady(false);
    }
  };

  const stopPreview = () => {
    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
        setIsPlaying(false);
      } catch (e) {
        console.warn('Error stopping preview:', e);
        setIsPlaying(false);
      }
    }
  };

  const handleSend = async () => {
    try {
      let blobToSend = audioBlob;
      
      // If still recording, stop immediately and get blob
      if (isRecording || isPaused) {
        // Stop all recording state IMMEDIATELY (before waiting for blob)
        setIsRecording(false);
        setIsPaused(false);
        isRecordingRef.current = false;
        isPausedRef.current = false;
        
        // Stop timer immediately
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        
        // Stop visualization immediately
        if (visualizationAnimationRef.current) {
          cancelAnimationFrame(visualizationAnimationRef.current);
          visualizationAnimationRef.current = null;
        }
        
        // Stop recording and get blob
        if (recordRTCRef.current) {
          // Stop recording - use callback to get blob
          recordRTCRef.current.stopRecording(() => {
            try {
              const blob = recordRTCRef.current.getBlob();
              if (blob && blob.size > 0) {
                blobToSend = blob;
              }
            } catch (e) {
              console.warn('Could not get blob from RecordRTC:', e);
            }
          });
          
          // Try to get blob immediately (RecordRTC might have it)
          try {
            const immediateBlob = recordRTCRef.current.getBlob();
            if (immediateBlob && immediateBlob.size > 0) {
              blobToSend = immediateBlob;
            }
          } catch (e) {
            // Blob not ready yet, will get it from callback
          }
        }
        
        // Stop stream tracks immediately
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        
        // If we don't have blob yet, wait a tiny bit for RecordRTC callback
        if (!blobToSend && recordRTCRef.current) {
          // Wait max 300ms for blob from callback
          for (let attempt = 0; attempt < 6 && !blobToSend; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 50));
            try {
              const blob = recordRTCRef.current.getBlob();
              if (blob && blob.size > 0) {
                blobToSend = blob;
                break;
              }
            } catch (e) {
              // Continue waiting
            }
          }
        }
      }
      
      if (blobToSend && blobToSend.size > 0) {
        // ✅ Get actual audio duration from blob (more accurate than timer)
        const actualDuration = await getAudioDuration(blobToSend);
        
        // Send immediately - don't wait for cleanup
        onSend(blobToSend, actualDuration);
        // Cleanup after sending
        cleanup();
      } else {
        toast.error('No recording available');
        cleanup();
      }
    } catch (error) {
      console.error('Send error:', error);
      toast.error('Failed to send voice message');
      cleanup();
    }
  };

  const handleDelete = () => {
    // ✅ Stop any playing audio first
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = '';
      audioElementRef.current = null;
    }
    
    // ✅ Revoke blob URL if exists
    if (audioUrl && typeof window !== 'undefined' && typeof URL !== 'undefined') {
      try {
        URL.revokeObjectURL(audioUrl);
      } catch (e) {
        // Ignore errors
      }
    }
    
    cleanup();
    
    // ✅ Reset all state completely
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setIsRecording(false);
    setIsPaused(false);
    setIsPlaying(false);
    setIsAudioReady(false);
    isRecordingRef.current = false;
    isPausedRef.current = false;
    recordingStartTimeRef.current = 0;
    pausedTimeRef.current = 0;
    
    onCancel();
  };

  const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Recording State (active recording)
  if (isRecording && !isPaused) {
    return (
      <div className="w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="bg-gray-800 dark:bg-gray-700 rounded-2xl px-4 py-3 flex items-center gap-3"
        >
          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="flex-shrink-0 p-2 hover:bg-gray-700 dark:hover:bg-gray-600 rounded-full transition-colors"
            title="Delete"
            aria-label="Delete recording"
          >
            <Trash2 className="w-5 h-5 text-white" />
          </button>

          {/* Recording Indicator */}
          <motion.div
            className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
          />

          {/* Timer */}
          <span className="text-white font-mono text-sm font-medium min-w-[40px]">
            {formatDuration(duration)}
          </span>

          {/* Waveform Visualization */}
          <div className="flex-1 h-8 flex items-center justify-center">
            <canvas
              ref={visualizationRef}
              className="w-full h-full"
              width={300}
              height={32}
            />
          </div>

          {/* Pause Button (stops recording, no resume) */}
          <button
            onClick={pauseRecording}
            className="flex-shrink-0 p-2 hover:bg-gray-700 dark:hover:bg-gray-600 rounded-full transition-colors"
            title="Pause recording"
            aria-label="Pause recording"
          >
            <Pause className="w-5 h-5 text-white" />
          </button>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={duration === 0}
            className="flex-shrink-0 p-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:opacity-50 rounded-full transition-colors"
            title="Send voice message"
            aria-label="Send voice message"
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </motion.div>
      </div>
    );
  }

  // Paused State (can play and send, no resume)
  if (isPaused && audioBlob) {
    return (
      <div className="w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="bg-blue-800 dark:bg-blue-900/30 rounded-2xl px-4 py-3 flex items-center gap-3"
        >
          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="flex-shrink-0 p-2 hover:bg-gray-700 dark:hover:bg-gray-600 rounded-full transition-colors"
            title="Delete"
          >
            <Trash2 className="w-5 h-5 text-white" />
          </button>

          {/* Timer & Status */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-white font-mono text-sm font-medium min-w-[40px]">
              {formatDuration(duration)}
            </span>
            {/* ✅ Ready to listen indicator */}
            {isAudioReady ? (
              <span className="text-xs text-green-300">✓ Ready</span>
            ) : (
              <span className="text-xs text-gray-400">Loading...</span>
            )}
          </div>

          {/* Waveform Visualization - Static when paused */}
          <div className="flex-1 h-8 flex items-center justify-center">
            <div className="text-white text-xs opacity-70">Paused</div>
          </div>

          {/* ✅ Play Preview Button (when paused) */}
          <button
            onClick={isPlaying ? stopPreview : playPreview}
            disabled={!isAudioReady}
            className="flex-shrink-0 p-2 hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-full transition-colors"
            title={isPlaying ? 'Pause preview' : isAudioReady ? 'Play preview' : 'Audio loading...'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white" />
            ) : (
              <Play className="w-5 h-5 text-white" />
            )}
          </button>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={!isAudioReady || duration === 0}
            className="flex-shrink-0 p-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:opacity-50 rounded-full transition-colors"
            title={isAudioReady ? 'Send voice message' : 'Audio not ready'}
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </motion.div>
      </div>
    );
  }

  // Preview State (after stop, before send)
  if (audioBlob && !isRecording && !isPaused) {
    return (
      <div className="w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="bg-gray-800 dark:bg-gray-700 rounded-2xl px-4 py-3 flex items-center gap-3"
        >
          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="flex-shrink-0 p-2 hover:bg-gray-700 dark:hover:bg-gray-600 rounded-full transition-colors"
            title="Delete"
          >
            <Trash2 className="w-5 h-5 text-white" />
          </button>

          {/* Timer & Status */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-white font-mono text-sm font-medium min-w-[40px]">
              {formatDuration(duration)}
            </span>
            {/* ✅ Ready to listen indicator */}
            {isAudioReady ? (
              <span className="text-xs text-green-300">✓ Ready</span>
            ) : (
              <span className="text-xs text-gray-400">Loading...</span>
            )}
          </div>

          {/* Waveform Visualization */}
          <div className="flex-1 h-8 flex items-center justify-center">
            <div className="text-white text-xs opacity-70">Voice message recorded</div>
          </div>

          {/* Play/Stop Preview Button */}
          <button
            onClick={isPlaying ? stopPreview : playPreview}
            disabled={!isAudioReady}
            className="flex-shrink-0 p-2 hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-full transition-colors"
            title={isPlaying ? 'Stop preview' : isAudioReady ? 'Play preview' : 'Audio loading...'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white" />
            ) : (
              <Play className="w-5 h-5 text-white" />
            )}
          </button>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={!isAudioReady || duration === 0}
            className="flex-shrink-0 p-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:opacity-50 rounded-full transition-colors"
            title={isAudioReady ? 'Send voice message' : 'Audio not ready'}
          >
            <Send className="w-5 h-5 text-white" />
          </button>
        </motion.div>
      </div>
    );
  }

  // Mic error state - show retry UI
  if (micError) {
    return (
      <div className="w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="bg-red-800/90 dark:bg-red-900/60 rounded-2xl px-4 py-3 flex items-center gap-3"
        >
          <Mic className="w-5 h-5 text-red-300 flex-shrink-0" />
          <span className="text-white text-sm flex-1 truncate">{micError}</span>
          <button
            onClick={() => {
              setMicError(null);
              startRecording();
            }}
            className="flex-shrink-0 p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Retry"
            aria-label="Retry microphone access"
          >
            <RefreshCw className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={onCancel}
            className="flex-shrink-0 p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Cancel"
            aria-label="Cancel recording"
          >
            <Trash2 className="w-5 h-5 text-white" />
          </button>
        </motion.div>
      </div>
    );
  }

  return null;
}
