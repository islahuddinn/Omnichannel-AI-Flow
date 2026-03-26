// // src/components/chat/VoiceRecorder.jsx - FULLY FUNCTIONAL VOICE RECORDING
// 'use client';

// import { useState, useRef, useEffect } from 'react';
// import { Mic, Square, Trash2, Send, X } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { cn } from '@/lib/utils';
// import { toast } from 'sonner';

// export default function VoiceRecorder({ onSend, onCancel }) {
//   const [isRecording, setIsRecording] = useState(false);
//   const [duration, setDuration] = useState(0);
//   const [audioBlob, setAudioBlob] = useState(null);
//   const [audioUrl, setAudioUrl] = useState(null);
//   const mediaRecorderRef = useRef(null);
//   const chunksRef = useRef([]);
//   const timerRef = useRef(null);
//   const streamRef = useRef(null);

//   useEffect(() => {
//     // Start recording automatically when component mounts
//     startRecording();

//     return () => {
//       // Cleanup on unmount
//       if (timerRef.current) {
//         clearInterval(timerRef.current);
//       }
//       if (streamRef.current) {
//         streamRef.current.getTracks().forEach(track => track.stop());
//       }
//       if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
//         mediaRecorderRef.current.stop();
//       }
//       if (audioUrl) {
//         URL.revokeObjectURL(audioUrl);
//       }
//     };
//   }, []);

//   const startRecording = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//       streamRef.current = stream;

//       // Use webm codec if available, fallback to default
//       const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
//         ? 'audio/webm' 
//         : 'audio/ogg';

//       const mediaRecorder = new MediaRecorder(stream, { mimeType });
//       mediaRecorderRef.current = mediaRecorder;
//       chunksRef.current = [];

//       mediaRecorder.ondataavailable = (e) => {
//         if (e.data.size > 0) {
//           chunksRef.current.push(e.data);
//         }
//       };

//       mediaRecorder.onstop = () => {
//         const blob = new Blob(chunksRef.current, { type: mimeType });
//         setAudioBlob(blob);
//         const url = URL.createObjectURL(blob);
//         setAudioUrl(url);
        
//         // Stop all tracks
//         stream.getTracks().forEach(track => track.stop());
//       };

//       mediaRecorder.onerror = (error) => {
//         console.error('MediaRecorder error:', error);
//         toast.error('Recording error occurred');
//         onCancel();
//       };

//       mediaRecorder.start();
//       setIsRecording(true);

//       // Start timer
//       timerRef.current = setInterval(() => {
//         setDuration(prev => {
//           const newDuration = prev + 1;
//           // Auto-stop at 5 minutes
//           if (newDuration >= 300) {
//             stopRecording();
//           }
//           return newDuration;
//         });
//       }, 1000);

//     } catch (error) {
//       console.error('Error starting recording:', error);
      
//       if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
//         toast.error('Microphone permission denied. Please allow microphone access.');
//       } else if (error.name === 'NotFoundError') {
//         toast.error('No microphone found. Please connect a microphone.');
//       } else {
//         toast.error('Could not access microphone. Please check your settings.');
//       }
      
//       onCancel();
//     }
//   };

//   const stopRecording = () => {
//     if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
//       mediaRecorderRef.current.stop();
//       setIsRecording(false);
      
//       if (timerRef.current) {
//         clearInterval(timerRef.current);
//       }
//     }
//   };

//   const handleDiscard = () => {
//     if (audioUrl) {
//       URL.revokeObjectURL(audioUrl);
//     }
//     onCancel();
//   };

//   const handleSend = () => {
//     if (audioBlob) {
//       onSend(audioBlob, duration);
//     } else {
//       toast.error('No recording available');
//     }
//   };

//   const formatTime = (seconds) => {
//     const mins = Math.floor(seconds / 60);
//     const secs = seconds % 60;
//     return `${mins}:${secs.toString().padStart(2, '0')}`;
//   };

//   return (
//     <div className="border-t bg-white dark:bg-gray-900 p-4">
//       <div className="flex flex-col gap-4">
//         {/* Recording Info */}
//         <div className="flex items-center justify-center gap-4">
//           <div className="flex items-center gap-2">
//             {isRecording && (
//               <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
//             )}
//             <span className="text-2xl font-mono font-bold text-gray-900 dark:text-white">
//               {formatTime(duration)}
//             </span>
//           </div>
//         </div>

//         {/* Waveform Visual (Simple Animation) */}
//         {isRecording && (
//           <div className="flex items-center justify-center gap-1 h-12">
//             {[...Array(20)].map((_, i) => (
//               <div
//                 key={i}
//                 className="w-1 bg-blue-500 rounded-full animate-pulse"
//                 style={{
//                   height: `${Math.random() * 100}%`,
//                   animationDelay: `${i * 0.05}s`
//                 }}
//               />
//             ))}
//           </div>
//         )}

//         {/* Audio Preview */}
//         {audioUrl && !isRecording && (
//           <div className="flex items-center justify-center">
//             <audio 
//               src={audioUrl} 
//               controls
//               className="w-full max-w-md"
//             />
//           </div>
//         )}

//         {/* Controls */}
//         <div className="flex items-center justify-center gap-4">
//           {isRecording ? (
//             <>
//               <Button
//                 size="lg"
//                 variant="destructive"
//                 onClick={handleDiscard}
//                 className="gap-2"
//               >
//                 <X className="h-5 w-5" />
//                 Cancel
//               </Button>
//               <Button
//                 size="lg"
//                 onClick={stopRecording}
//                 className="gap-2"
//               >
//                 <Square className="h-5 w-5" />
//                 Stop
//               </Button>
//             </>
//           ) : (
//             <>
//               <Button
//                 size="lg"
//                 variant="outline"
//                 onClick={handleDiscard}
//                 className="gap-2"
//               >
//                 <Trash2 className="h-5 w-5" />
//                 Discard
//               </Button>
//               <Button
//                 size="lg"
//                 onClick={handleSend}
//                 disabled={!audioBlob}
//                 className="gap-2"
//               >
//                 <Send className="h-5 w-5" />
//                 Send
//               </Button>
//             </>
//           )}
//         </div>

//         {/* Instructions */}
//         <div className="text-center text-sm text-gray-500">
//           {isRecording ? (
//             <p>Recording... Click stop when finished</p>
//           ) : (
//             <p>Preview your recording and send or discard</p>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }



// src/components/chat/VoiceRecorder.jsx - WhatsApp-Style Voice Recording

'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Send, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function VoiceRecorder({ onSend, onCancel }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioReady, setIsAudioReady] = useState(false); // ✅ Indicator for ready to listen
  const [waveformData, setWaveformData] = useState(Array(30).fill(0));
  
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioElementRef = useRef(null);
  const timerRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    // Auto-start recording when component mounts
    startRecording();
    
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    // ✅ Fix AudioContext cleanup - check state before closing
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(err => {
            console.warn('AudioContext close error (non-critical):', err);
          });
        }
      } catch (err) {
        console.warn('AudioContext cleanup error (non-critical):', err);
      }
      audioContextRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('MediaRecorder stop error (non-critical):', err);
      }
      mediaRecorderRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      // ✅ Simplified audio constraints - only use well-supported options
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // ✅ Don't force sampleRate/channelCount/latency - let browser choose optimal settings
          // ✅ Remove Google-specific constraints - not supported by all browsers
        } 
      });
      streamRef.current = stream;

      // ✅ Setup audio visualization - don't force sampleRate
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start visualization
      visualizeAudio();

      // ✅ Setup MediaRecorder with optimal settings
      // ✅ Try to use the best supported codec
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }
      
      // ✅ Use minimal options - let browser choose optimal settings
      const mediaRecorderOptions = {
        mimeType: mimeType,
      };
      
      // ✅ Create MediaRecorder with error handling
      let mediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
      } catch (error) {
        console.warn('Failed to create MediaRecorder with options, trying without:', error);
        // ✅ Fallback: try without options
        try {
          mediaRecorder = new MediaRecorder(stream);
          mimeType = mediaRecorder.mimeType || 'audio/webm';
        } catch (fallbackError) {
          console.error('Failed to create MediaRecorder:', fallbackError);
          toast.error('Recording not supported in this browser');
          onCancel?.();
          return;
        }
      }
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // ✅ Clear chunks array before starting
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        // ✅ Only add chunks with actual data
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // ✅ Handle errors
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error);
        toast.error('Recording error occurred');
      };

      mediaRecorder.onstop = () => {
        // ✅ Create blob from all accumulated chunks
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          setAudioBlob(blob);
          setIsAudioReady(true); // ✅ Mark as ready to listen
        }
        // ✅ Stop stream tracks
        if (stream && stream.getTracks) {
          stream.getTracks().forEach(track => track.stop());
        }
      };

      // ✅ Start recording - let MediaRecorder handle chunking automatically
      // ✅ Don't use timeslice - it causes voice breaking with too frequent chunks
      try {
        mediaRecorder.start();
      } catch (error) {
        console.error('Failed to start MediaRecorder:', error);
        toast.error('Failed to start recording');
        onCancel?.();
        return;
      }
      setIsRecording(true);
      setDuration(0);

      // ✅ Start timer - ensure only one interval is running
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          const newDuration = prev + 1;
          // Auto-stop at 15 minutes (like WhatsApp)
          if (newDuration >= 900) {
            handleStopAndSend();
          }
          return newDuration;
        });
      }, 1000);
    } catch (error) {
      console.error('Recording error:', error);
      if (error.name === 'NotAllowedError') {
        toast.error('Microphone permission denied');
      } else if (error.name === 'NotFoundError') {
        toast.error('No microphone found');
      } else {
        toast.error('Could not access microphone');
      }
      onCancel?.();
    }
  };

  const visualizeAudio = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    
    const animate = () => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Create waveform data (30 bars)
      const barCount = 30;
      const step = Math.floor(dataArray.length / barCount);
      const newWaveform = [];
      
      for (let i = 0; i < barCount; i++) {
        const index = i * step;
        const value = dataArray[index] / 255; // Normalize to 0-1
        newWaveform.push(value);
      }
      
      setWaveformData(newWaveform);
      
      if (isRecording || isPaused) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };
    
    animate();
  };

  // ✅ Helper function to get actual audio duration from blob (must be defined before use)
  const getAudioDuration = async (blob, fallbackDuration = 0) => {
    if (!blob || blob.size === 0) return fallbackDuration;
    
    try {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      return new Promise((resolve) => {
        audio.addEventListener('loadedmetadata', () => {
          const dur = audio.duration;
          URL.revokeObjectURL(url);
          if (dur && isFinite(dur) && !isNaN(dur) && dur > 0) {
            resolve(Math.floor(dur));
          } else {
            resolve(fallbackDuration); // Fallback to provided duration
          }
        });
        
        audio.addEventListener('error', () => {
          URL.revokeObjectURL(url);
          resolve(fallbackDuration); // Fallback to provided duration
        });
        
        // Timeout after 2 seconds
        setTimeout(() => {
          URL.revokeObjectURL(url);
          resolve(fallbackDuration);
        }, 2000);
        
        audio.load();
      });
    } catch (error) {
      console.warn('Error getting audio duration:', error);
      return fallbackDuration; // Fallback to provided duration
    }
  };

  const handleStopAndSend = async () => {
    // ✅ Stop recording immediately
    setIsRecording(false);
    setIsPaused(false);
    
    // Stop timer immediately
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Stop visualization immediately
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Stop MediaRecorder and get blob
    let blobToSend = audioBlob;
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // ✅ Stop recording
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.error('Error stopping MediaRecorder:', error);
      }
      
      // ✅ Wait for onstop callback to complete and create blob
      try {
        await new Promise((resolve) => {
          let attempts = 0;
          const maxAttempts = 20; // 20 * 50ms = 1 second max wait
          
          const checkBlob = () => {
            attempts++;
            if (audioChunksRef.current.length > 0) {
              const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
              const blob = new Blob(audioChunksRef.current, { type: mimeType });
              if (blob && blob.size > 0) {
                blobToSend = blob;
                setAudioBlob(blob);
                resolve();
                return;
              }
            }
            
            if (attempts < maxAttempts) {
              setTimeout(checkBlob, 50);
            } else {
              // Timeout - use whatever chunks we have
              resolve();
            }
          };
          
          // Start checking immediately
          checkBlob();
        });
      } catch (err) {
        console.warn('Error getting blob:', err);
      }
    }
    
    // ✅ Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          // Ignore errors
        }
      });
    }
    
    // ✅ Send immediately if we have blob
    if (blobToSend && blobToSend.size > 0) {
      // ✅ Get actual audio duration from blob (more accurate than timer)
      const actualDuration = await getAudioDuration(blobToSend, duration);
      onSend(blobToSend, actualDuration);
      cleanup();
    } else if (audioChunksRef.current.length > 0) {
      // ✅ Create blob from chunks if available
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
      blobToSend = new Blob(audioChunksRef.current, { type: mimeType });
      if (blobToSend && blobToSend.size > 0) {
        // ✅ Get actual audio duration from blob
        const actualDuration = await getAudioDuration(blobToSend, duration);
        onSend(blobToSend, actualDuration);
        cleanup();
      } else {
        toast.error('No recording available');
        cleanup();
      }
    } else {
      toast.error('No recording available');
      cleanup();
    }
  };

  const handlePause = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      // ✅ Stop recording completely (no resume functionality)
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.error('Error stopping MediaRecorder:', error);
      }
      
      setIsRecording(false);
      setIsPaused(true);
      
      // ✅ Stop timer immediately and clear reference
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // ✅ Stop visualization
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // ✅ Wait a bit for onstop callback to complete
      await new Promise((resolve) => {
        // Wait max 500ms for MediaRecorder to finish
        setTimeout(() => {
          // ✅ Create blob from current chunks for preview
          if (audioChunksRef.current.length > 0) {
            const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            if (blob && blob.size > 0) {
              setAudioBlob(blob);
              
              // ✅ Get actual audio duration from blob immediately
              getAudioDuration(blob, duration).then((actualDuration) => {
                setDuration(actualDuration); // Update duration with actual audio duration
              });
              
              setIsAudioReady(true); // ✅ Mark as ready to listen
            } else {
              setIsAudioReady(false);
            }
          } else {
            setIsAudioReady(false);
          }
          resolve();
        }, 100); // Small delay to ensure onstop callback completes
      });
    }
  };

  const handlePlayPreview = async () => {
    try {
      // ✅ Stop any currently playing audio first
      if (audioElementRef.current && !audioElementRef.current.paused) {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
      }
      
      // ✅ Create blob from chunks if not available (for paused state)
      let blobToPlay = audioBlob;
      
      if (!blobToPlay && audioChunksRef.current.length > 0) {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        blobToPlay = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blobToPlay);
        setIsAudioReady(true);
      }
      
      if (blobToPlay && blobToPlay.size > 0) {
        // ✅ Create new audio element for each playback (prevents errors)
        if (audioElementRef.current) {
          audioElementRef.current.pause();
          audioElementRef.current.src = '';
          audioElementRef.current.oncanplay = null;
          audioElementRef.current.onplay = null;
          audioElementRef.current.onended = null;
          audioElementRef.current.onerror = null;
        }
        
        const url = URL.createObjectURL(blobToPlay);
        const audio = new Audio();
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
          URL.revokeObjectURL(url);
        };
        
        audio.onerror = (e) => {
          console.error('Audio playback error:', e);
          setIsPlaying(false);
          setIsAudioReady(false);
          URL.revokeObjectURL(url);
          toast.error('Failed to play preview');
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
          URL.revokeObjectURL(url);
          toast.error('Failed to play preview');
        }
      } else if (!blobToPlay || blobToPlay.size === 0) {
        toast.error('Audio not ready yet');
        setIsAudioReady(false);
      }
    } catch (error) {
      console.error('Preview error:', error);
      setIsPlaying(false);
      setIsAudioReady(false);
      toast.error('Failed to play preview');
    }
  };

  const handleDelete = () => {
    // ✅ Stop any playing audio first
    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.src = '';
        audioElementRef.current.oncanplay = null;
        audioElementRef.current.onplay = null;
        audioElementRef.current.onended = null;
        audioElementRef.current.onerror = null;
        audioElementRef.current = null;
      } catch (e) {
        // Ignore errors
      }
    }
    
    cleanup();
    
    // ✅ Reset all state completely
    setAudioBlob(null);
    setDuration(0);
    setIsRecording(false);
    setIsPaused(false);
    setIsPlaying(false);
    setIsAudioReady(false);
    setWaveformData(Array(30).fill(0));
    
    onCancel?.();
  };

  const handleSend = async () => {
    // ✅ Send immediately - don't wait
    let blobToSend = audioBlob;
    let actualDuration = duration;
    
    if (blobToSend && blobToSend.size > 0) {
      // ✅ Get actual audio duration from blob (more accurate than timer)
      actualDuration = await getAudioDuration(blobToSend, duration);
      onSend(blobToSend, actualDuration);
      cleanup();
    } else {
      // If no blob yet, try to get it from chunks
      if (audioChunksRef.current.length > 0) {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        blobToSend = new Blob(audioChunksRef.current, { type: mimeType });
        // ✅ Get actual audio duration from blob
        actualDuration = await getAudioDuration(blobToSend, duration);
        onSend(blobToSend, actualDuration);
        cleanup();
      } else {
        toast.error('No recording available');
        cleanup();
      }
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Recording State (active recording)
  if (isRecording && !isPaused) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="flex items-center gap-2 w-full px-3 py-3 bg-white dark:bg-gray-900 border-t"
      >
        {/* Delete Button */}
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDelete}
          className="h-9 w-9 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
          title="Cancel recording"
        >
          <Trash2 className="h-5 w-5 text-red-600" />
        </Button>

        {/* Waveform & Timer Container */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          {/* Timer */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-gray-900 dark:text-white font-mono">
              {formatDuration(duration)}
            </span>
          </div>

          {/* Waveform */}
          <div className="flex items-center gap-0.5 h-8 flex-1 overflow-hidden">
            {waveformData.map((value, i) => (
              <motion.div
                key={i}
                className="flex-1 bg-blue-500 rounded-full min-w-[2px]"
                animate={{
                  height: `${Math.max(value * 100, 10)}%`,
                }}
                transition={{ duration: 0.1 }}
              />
            ))}
          </div>
        </div>

        {/* Pause Button (stops recording, no resume) */}
        <Button
          size="icon"
          variant="ghost"
          onClick={handlePause}
          className="h-9 w-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0"
          title="Pause recording"
        >
          <Pause className="h-5 w-5 text-blue-600" />
        </Button>

        {/* Send Button */}
        <Button
          size="icon"
          onClick={handleStopAndSend}
          className="h-10 w-10 rounded-full bg-blue-600 hover:bg-blue-700 flex-shrink-0"
          title="Send voice message"
        >
          <Send className="h-5 w-5 text-white" />
        </Button>
      </motion.div>
    );
  }

  // Paused State (can play and send, no resume)
  if (isPaused && audioBlob) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="flex items-center gap-2 w-full px-3 py-3 bg-blue-50 dark:bg-blue-900/20 border-t"
      >
        <audio ref={audioElementRef} className="hidden" />
        
        {/* Delete Button */}
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDelete}
          className="h-9 w-9 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
          title="Cancel recording"
        >
          <Trash2 className="h-5 w-5 text-red-600" />
        </Button>

        {/* Timer & Status */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm font-medium text-gray-900 dark:text-white font-mono">
              {formatDuration(duration)}
            </span>
            {/* ✅ Ready to listen indicator */}
            {isAudioReady ? (
              <span className="text-xs text-green-600 dark:text-green-400">✓ Ready</span>
            ) : (
              <span className="text-xs text-gray-500 dark:text-gray-400">Loading...</span>
            )}
          </div>
        </div>

        {/* ✅ Play Preview Button (when paused) */}
        <Button
          size="icon"
          variant="ghost"
          onClick={handlePlayPreview}
          disabled={!isAudioReady || (isPlaying && !audioElementRef.current?.paused)}
          className="h-9 w-9 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40 flex-shrink-0"
          title={isPlaying ? 'Pause preview' : isAudioReady ? 'Play preview' : 'Audio loading...'}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 text-blue-600" />
          ) : (
            <Play className="h-5 w-5 text-blue-600" />
          )}
        </Button>

        {/* Send Button */}
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!isAudioReady}
          className="h-10 w-10 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          title={isAudioReady ? 'Send voice message' : 'Audio not ready'}
        >
          <Send className="h-5 w-5 text-white" />
        </Button>
      </motion.div>
    );
  }

  // Preview State (after stop, before send)
  if (audioBlob && !isRecording && !isPaused) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="flex items-center gap-2 w-full px-3 py-3 bg-blue-50 dark:bg-blue-900/20 border-t"
      >
        <audio ref={audioElementRef} className="hidden" />

        {/* Delete Button */}
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDelete}
          className="h-9 w-9 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
          title="Discard"
        >
          <Trash2 className="h-5 w-5 text-red-600" />
        </Button>

        {/* Duration & Status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-blue-900 dark:text-blue-100 font-mono">
              {formatDuration(duration)}
            </span>
            {/* ✅ Ready to listen indicator */}
            {isAudioReady ? (
              <span className="text-xs text-green-600 dark:text-green-400">✓ Ready</span>
            ) : (
              <span className="text-xs text-gray-500 dark:text-gray-400">Loading...</span>
            )}
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400">
            {isPlaying ? 'Playing...' : isAudioReady ? 'Tap to preview' : 'Audio loading...'}
          </div>
        </div>

        {/* Play Button */}
        <Button
          size="icon"
          variant="ghost"
          onClick={handlePlayPreview}
          disabled={!isAudioReady || isPlaying}
          className="h-9 w-9 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          title={isPlaying ? 'Playing...' : isAudioReady ? 'Play preview' : 'Audio loading...'}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 text-blue-600" />
          ) : (
            <Play className="h-5 w-5 text-blue-600" />
          )}
        </Button>

        {/* Send Button */}
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!isAudioReady}
          className="h-10 w-10 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          title={isAudioReady ? 'Send voice message' : 'Audio not ready'}
        >
          <Send className="h-5 w-5 text-white" />
        </Button>
      </motion.div>
    );
  }

  return null;
}