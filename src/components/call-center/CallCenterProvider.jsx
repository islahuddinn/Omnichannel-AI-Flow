// src/components/call-center/CallCenterProvider.jsx
// Call center: provides hidden audio elements for WebRTC, syncs refs with store, and handles incoming/outgoing ringtones.

'use client';

import { useEffect, useRef } from 'react';
import { useCallCenter } from '@/hooks/useCallCenter';
import { useCallCenterStore } from '@/store/useCallCenterStore';
import { useAuth } from '@/hooks/useAuth';
import MultipleCallModals from './CallModal';

export const CallCenterProvider = ({ children }) => {
  // Always call hooks (React rules), but useCallCenter will check authentication internally
  const { remoteAudioRef, localAudioRef } = useCallCenter();
  
  // Create dedicated refs for the actual DOM elements
  const remoteAudioElementRef = useRef(null);
  const localAudioElementRef = useRef(null);
  
  // Ringtone refs
  const incomingRingtoneRef = useRef(null);
  const outgoingRingtoneRef = useRef(null);
  
  // Setters to sync with store
  const setRemoteAudioRef = useCallCenterStore((state) => state.setRemoteAudioRef);
  const setLocalAudioRef = useCallCenterStore((state) => state.setLocalAudioRef);
  
  // Get call data to detect incoming/outgoing
  const callSessions = useCallCenterStore((state) => state.callSessions);
  const callStatuses = useCallCenterStore((state) => state.callStatuses);
  
  // Sync the DOM refs with the hook refs (like old code)
  useEffect(() => {
    if (remoteAudioElementRef.current) {
      remoteAudioRef.current = remoteAudioElementRef.current;
      setRemoteAudioRef(remoteAudioRef);
      console.log('Remote audio ref synchronized with DOM element');
    }
    
    if (localAudioElementRef.current) {
      localAudioRef.current = localAudioElementRef.current;
      setLocalAudioRef(localAudioRef);
      console.log('Local audio ref synchronized with DOM element');
    }
  }, [remoteAudioRef, localAudioRef, setRemoteAudioRef, setLocalAudioRef]);

  // Set up proper audio element configuration
  useEffect(() => {
    if (remoteAudioElementRef.current) {
      const remoteAudio = remoteAudioElementRef.current;
      
      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;
      remoteAudio.controls = false;
      remoteAudio.volume = 1.0;
      
      remoteAudio.addEventListener('loadstart', () => {
        console.log('Remote audio: loadstart');
      });
      
      remoteAudio.addEventListener('loadeddata', () => {
        console.log('Remote audio: loadeddata');
      });
      
      remoteAudio.addEventListener('canplay', () => {
        console.log('Remote audio: canplay');
      });
      
      remoteAudio.addEventListener('play', () => {
        console.log('Remote audio: playing');
      });
      
      remoteAudio.addEventListener('pause', () => {
        console.log('Remote audio: paused');
      });
      
      remoteAudio.addEventListener('error', (e) => {
        console.error('Remote audio error:', e);
      });
    }

    if (localAudioElementRef.current) {
      const localAudio = localAudioElementRef.current;
      
      localAudio.muted = true;
      localAudio.playsInline = true;
      localAudio.controls = false;
      
      localAudio.addEventListener('loadstart', () => {
        console.log('Local audio: loadstart');
      });
      
      localAudio.addEventListener('error', (e) => {
        console.error('Local audio error:', e);
      });
    }
  }, []);
  
  // Central ringtone policy:
  // - incoming tone for inbound ringing
  // - outgoing tone for outbound trying/ringing
  // - stop all tones once any call is connected/accepted
  useEffect(() => {
    let hasIncoming = false;
    let hasRinging = false;

    // Check all sessions for incoming calls or ringing state
    callSessions.forEach((session, sessionId) => {
      const status = callStatuses.get(sessionId);
      
      if (status?.includes('Incoming call')) {
        hasIncoming = true;
      } else if (status?.includes('Ringing') || status?.includes('Trying')) {
        hasRinging = true;
      }
    });

    // Play incoming ringtone
    if (hasIncoming) {
      if (incomingRingtoneRef.current) {
        incomingRingtoneRef.current.loop = true;
        incomingRingtoneRef.current.play().catch(err => {
          console.error('Failed to play incoming ringtone:', err);
        });
      }
      // Stop outgoing if playing
      if (outgoingRingtoneRef.current) {
        outgoingRingtoneRef.current.pause();
        outgoingRingtoneRef.current.currentTime = 0;
      }
    } else {
      // Stop incoming ringtone
      if (incomingRingtoneRef.current) {
        incomingRingtoneRef.current.pause();
        incomingRingtoneRef.current.currentTime = 0;
      }
    }

    // Play outgoing ringtone
    if (hasRinging && !hasIncoming) {
      if (outgoingRingtoneRef.current) {
        outgoingRingtoneRef.current.loop = true;
        outgoingRingtoneRef.current.play().catch(err => {
          console.error('Failed to play outgoing ringtone:', err);
        });
      }
    } else {
      // Stop outgoing ringtone
      if (outgoingRingtoneRef.current) {
        outgoingRingtoneRef.current.pause();
        outgoingRingtoneRef.current.currentTime = 0;
      }
    }

    // Stop all ringtones when call is established or ended
    const hasEstablished = Array.from(callStatuses.values()).some(status => 
      status?.includes('Call connected') || status?.includes('Call accepted')
    );

    if (hasEstablished || callSessions.size === 0) {
      if (incomingRingtoneRef.current) {
        incomingRingtoneRef.current.pause();
        incomingRingtoneRef.current.currentTime = 0;
      }
      if (outgoingRingtoneRef.current) {
        outgoingRingtoneRef.current.pause();
        outgoingRingtoneRef.current.currentTime = 0;
      }
    }

  }, [callSessions, callStatuses]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (incomingRingtoneRef.current) {
        incomingRingtoneRef.current.pause();
        incomingRingtoneRef.current.currentTime = 0;
      }
      if (outgoingRingtoneRef.current) {
        outgoingRingtoneRef.current.pause();
        outgoingRingtoneRef.current.currentTime = 0;
      }
    };
  }, []);
  
  return (
    <>
      {/* Call audio elements */}
      <audio 
        ref={remoteAudioElementRef}
        autoPlay 
        playsInline 
        style={{ display: 'none' }}
        data-testid="remote-audio"
      />
      <audio 
        ref={localAudioElementRef}
        muted 
        playsInline 
        style={{ display: 'none' }}
        data-testid="local-audio"
      />
      
      {/* Ringtone audio elements */}
      <audio 
        ref={incomingRingtoneRef}
        src="/sounds/incoming_call_tune.mp3"
        preload="auto"
        style={{ display: 'none' }}
        data-testid="incoming-ringtone"
      />
      <audio 
        ref={outgoingRingtoneRef}
        src="/sounds/outgoing_call_tune.mp3"
        preload="auto"
        style={{ display: 'none' }}
        data-testid="outgoing-ringtone"
      />
      
      {/* Call Modals */}
      <MultipleCallModals />
      
      {children}
    </>
  );
};
