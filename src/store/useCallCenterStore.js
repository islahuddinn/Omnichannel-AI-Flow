// src/store/useCallCenterStore.js
// Call center: global state for SIP extensions, user agents, active calls, media refs, and cleanup on logout.

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { RegistererState } from 'sip.js';
import apiClient from '../lib/api/client';

/**
 * Call Center Store - Adapted from Jotai atoms to Zustand.
 * Manages call center state: extensions, outbound numbers, sessions, etc.
 */
export const useCallCenterStore = create(
  devtools(
    (set, get) => ({
      // Extension state
      extensions: [],
      userAgents: new Map(),
      registrationStatuses: new Map(),
      selectedExtension: null,
      
      // Outbound number state
      availableOutboundNumbers: [],
      selectedOutboundNumber: null,
      lastUsedOutboundNumber: null,
      isUserInException: false,
      
      // Session state
      // Active session maps are keyed by generated sessionId for multi-call support.
      callSessions: new Map(),
      callStatuses: new Map(),
      phoneNumbers: new Map(),
      callDurations: new Map(),
      isMuted: new Map(),
      isOnHold: new Map(),
      callErrors: new Map(),
      incomingCallExtensions: new Map(),
      activeCallIds: [],
      
      // Preserve completed call data before deletion (for CallStatusTabs)
      // This allows UI tabs to keep final duration/status after session cleanup.
      completedCallDurations: new Map(), // sessionId -> duration
      completedCallStatuses: new Map(), // sessionId -> status
      completedCallPhoneNumbers: new Map(), // sessionId -> phoneNumber
      
      // UI state
      showCallModal: false,
      
      // Media refs
      remoteAudioRef: { current: null },
      localAudioRef: { current: null },
      currentSessionRef: { current: null },
      durationIntervalRef: { current: null },
      localStream: null,
      
      // Client IP
      clientIp: null,
      
      // Actions - Extensions
      setExtensions: (extensions) => set({ extensions }),
      setUserAgents: (userAgents) => set({ userAgents }),
      setRegistrationStatuses: (statuses) => set({ registrationStatuses: statuses }),
      setSelectedExtension: (extension) => {
        set({ selectedExtension: extension });
        // Persist to localStorage
        if (typeof window !== 'undefined' && extension) {
          try {
            localStorage.setItem('selectedExtension', extension.extension);
          } catch (error) {
            console.error('Error saving extension to localStorage:', error);
          }
        }
      },
      
      // Actions - Outbound Numbers
      setAvailableOutboundNumbers: (numbers) => set({ availableOutboundNumbers: numbers }),
      setSelectedOutboundNumber: (number) => {
        set({ selectedOutboundNumber: number });
        // Persist to localStorage
        if (typeof window !== 'undefined' && number) {
          try {
            localStorage.setItem('selectedOutboundNumber', number);
          } catch (error) {
            console.error('Error saving outbound number to localStorage:', error);
          }
        }
      },
      setLastUsedOutboundNumber: (number) => set({ lastUsedOutboundNumber: number }),
      setIsUserInException: (isException) => set({ isUserInException: isException }),
      
      // Actions - Sessions
      addSession: ({ session, status, phoneNumber, extension = null }) => {
        const sessionId = generateSessionId(session);
        const state = get();
        
        const newSessions = new Map(state.callSessions);
        const newStatuses = new Map(state.callStatuses);
        const newPhoneNumbers = new Map(state.phoneNumbers);
        const newDurations = new Map(state.callDurations);
        const newMutedStates = new Map(state.isMuted);
        const newHoldStates = new Map(state.isOnHold);
        const newErrors = new Map(state.callErrors);
        const newIncomingExtensions = new Map(state.incomingCallExtensions);
        
        newSessions.set(sessionId, session);
        newStatuses.set(sessionId, status);
        newPhoneNumbers.set(sessionId, phoneNumber);
        newDurations.set(sessionId, 0);
        newMutedStates.set(sessionId, false);
        newHoldStates.set(sessionId, false);
        newErrors.set(sessionId, null);
        if (extension) {
          newIncomingExtensions.set(sessionId, extension);
        }
        
        set({
          callSessions: newSessions,
          callStatuses: newStatuses,
          phoneNumbers: newPhoneNumbers,
          callDurations: newDurations,
          isMuted: newMutedStates,
          isOnHold: newHoldStates,
          callErrors: newErrors,
          incomingCallExtensions: newIncomingExtensions,
          activeCallIds: [...state.activeCallIds, sessionId]
        });
        
        return sessionId;
      },
      
      updateSessionStatus: ({ sessionId, status }) => {
        const state = get();
        const newStatuses = new Map(state.callStatuses);
        newStatuses.set(sessionId, status);
        set({ callStatuses: newStatuses });
      },
      
      removeSession: (sessionId) => {
        const state = get();
        const newSessions = new Map(state.callSessions);
        const newStatuses = new Map(state.callStatuses);
        const newPhoneNumbers = new Map(state.phoneNumbers);
        const newDurations = new Map(state.callDurations);
        const newMutedStates = new Map(state.isMuted);
        const newHoldStates = new Map(state.isOnHold);
        const newErrors = new Map(state.callErrors);
        const newIncomingExtensions = new Map(state.incomingCallExtensions);
        
        // CRITICAL: Preserve duration, status, and phone number before deletion (for CallStatusTabs)
        const finalDuration = newDurations.get(sessionId);
        const finalStatus = newStatuses.get(sessionId);
        const finalPhoneNumber = newPhoneNumbers.get(sessionId);
        const newCompletedDurations = new Map(state.completedCallDurations);
        const newCompletedStatuses = new Map(state.completedCallStatuses);
        const newCompletedPhoneNumbers = new Map(state.completedCallPhoneNumbers);
        
        if (finalDuration !== undefined && finalDuration !== null) {
          newCompletedDurations.set(sessionId, finalDuration);
        }
        if (finalStatus) {
          newCompletedStatuses.set(sessionId, finalStatus);
        }
        if (finalPhoneNumber) {
          newCompletedPhoneNumbers.set(sessionId, finalPhoneNumber);
        }
        
        newSessions.delete(sessionId);
        newStatuses.delete(sessionId);
        newPhoneNumbers.delete(sessionId);
        newDurations.delete(sessionId);
        newMutedStates.delete(sessionId);
        newHoldStates.delete(sessionId);
        newErrors.delete(sessionId);
        newIncomingExtensions.delete(sessionId);
        
        set({
          callSessions: newSessions,
          callStatuses: newStatuses,
          phoneNumbers: newPhoneNumbers,
          callDurations: newDurations,
          isMuted: newMutedStates,
          isOnHold: newHoldStates,
          callErrors: newErrors,
          incomingCallExtensions: newIncomingExtensions,
          activeCallIds: state.activeCallIds.filter(id => id !== sessionId),
          completedCallDurations: newCompletedDurations,
          completedCallStatuses: newCompletedStatuses,
          completedCallPhoneNumbers: newCompletedPhoneNumbers
        });
      },
      
      // Actions - UI
      setShowCallModal: (show) => set({ showCallModal: show }),
      
      // Actions - Media
      setRemoteAudioRef: (ref) => set({ remoteAudioRef: ref }),
      setLocalAudioRef: (ref) => set({ localAudioRef: ref }),
      setCurrentSessionRef: (ref) => set({ currentSessionRef: ref }),
      setDurationIntervalRef: (ref) => set({ durationIntervalRef: ref }),
      setLocalStream: (stream) => set({ localStream: stream }),
      
      // Actions - Client IP
      setClientIp: (ip) => set({ clientIp: ip }),
      
      // Helper to get overall status
      getOverallStatus: () => {
        const state = get();
        const registrationStatuses = state.registrationStatuses;
        const extensions = state.extensions;
        
        if (registrationStatuses.size === 0) return 'initializing';
        
        const statuses = Array.from(registrationStatuses.values());
        const registeredCount = statuses.filter(status => status === 'registered').length;
        const connectingCount = statuses.filter(status => status === 'connecting' || status === 'connected').length;
        const failedCount = statuses.filter(status => status.startsWith('failed') || status.startsWith('error')).length;
        
        if (registeredCount === 0 && failedCount > 0) return 'failed';
        if (registeredCount === 0 && connectingCount > 0) return 'connecting';
        if (registeredCount === 0) return 'disconnected';
        if (registeredCount === extensions.length) return 'registered';
        return 'partial';
      },
      
      // Action methods - will be implemented in useCallCenter hook
      makeCall: null, // Set by useCallCenter hook
      answerCall: null,
      hangupCall: null,
      toggleMute: null,
      toggleHold: null,
      transferCall: null,
      holdAllOtherCalls: null,
      makeCallActive: null,
      setupAudioStreams: null,
      initializeUserMedia: null,
      formatPhoneNumber: null,
      formatDuration: null,
      
      // Set action methods (called by useCallCenter hook)
      setActionMethods: (methods) => {
        set({
          makeCall: methods.makeCall,
          answerCall: methods.answerCall,
          hangupCall: methods.hangupCall,
          toggleMute: methods.toggleMute,
          toggleHold: methods.toggleHold,
          transferCall: methods.transferCall,
          holdAllOtherCalls: methods.holdAllOtherCalls,
          makeCallActive: methods.makeCallActive,
          setupAudioStreams: methods.setupAudioStreams,
          initializeUserMedia: methods.initializeUserMedia,
          formatPhoneNumber: methods.formatPhoneNumber,
          formatDuration: methods.formatDuration,
        });
      },

      // Cleanup all SIP connections on logout
      cleanupSipConnections: async () => {
        const state = get();
        const { userAgents, registrationStatuses, localStream, clientIp } = state;

        console.log('🧹 Cleaning up SIP connections on logout...');

        // Unregister IP address if registered
        if (clientIp) {
          try {
            console.log(`📡 Unregistering IP address: ${clientIp}...`);
            await apiClient.post('/users/unregister-ip', { ip: clientIp });
            console.log('✅ IP address unregistered');
          } catch (error) {
            console.error('Error unregistering IP:', error);
            // Don't throw - continue with other cleanup
          }
        }

        // Stop all media streams
        if (localStream) {
          try {
            localStream.getTracks().forEach(track => {
              track.stop();
            });
            console.log('✅ Stopped local media stream');
          } catch (error) {
            console.error('Error stopping local stream:', error);
          }
        }

        // Unregister all extensions and stop all UserAgents
        const cleanupPromises = [];

        userAgents.forEach((userAgent, extensionNumber) => {
          try {
            // Unregister if registered
            if (userAgent.registerer) {
              const registererState = userAgent.registerer.state;
              // Check if registered (using RegistererState enum or state comparison)
              if (registererState === RegistererState.Registered || 
                  registererState === 'Registered' ||
                  registererState === 2) {
                console.log(`📞 Unregistering extension ${extensionNumber}...`);
                cleanupPromises.push(
                  userAgent.registerer.unregister().catch(error => {
                    // Ignore "already in progress" errors
                    if (!error.message?.includes('already in progress')) {
                      console.error(`Failed to unregister extension ${extensionNumber}:`, error);
                    }
                  })
                );
              }
            }

            // Stop UserAgent (this will close the WebSocket connection)
            if (userAgent && userAgent.state !== 'Stopped' && userAgent.state !== 'Terminated') {
              console.log(`🔌 Stopping UserAgent for extension ${extensionNumber}...`);
              cleanupPromises.push(
                userAgent.stop().catch(error => {
                  // Ignore "Invalid state transition" errors
                  if (!error.message?.includes('Invalid state transition')) {
                    console.error(`Failed to stop UserAgent for extension ${extensionNumber}:`, error);
                  }
                })
              );
            }
          } catch (error) {
            console.error(`Error cleaning up extension ${extensionNumber}:`, error);
          }
        });

        // Wait for all cleanup operations to complete
        await Promise.allSettled(cleanupPromises);

        // Clear all state
        set({
          userAgents: new Map(),
          registrationStatuses: new Map(),
          extensions: [],
          callSessions: new Map(),
          callStatuses: new Map(),
          phoneNumbers: new Map(),
          callDurations: new Map(),
          isMuted: new Map(),
          isOnHold: new Map(),
          callErrors: new Map(),
          incomingCallExtensions: new Map(),
          activeCallIds: [],
          localStream: null,
          selectedExtension: null,
          clientIp: null,
        });

        console.log('✅ SIP connections cleaned up successfully');
      },
    }),
    { name: 'CallCenterStore' }
  )
);

// Helper function to generate unique session ID
const generateSessionId = (session) => {
  if (session.dialog?.callId) {
    return session.dialog.callId;
  }
  if (session.request?.callId) {
    return session.request.callId;
  }
  if (session.incomingInviteRequest) {
    return session.incomingInviteRequest.callId;
  }
  if (session.outgoingInviteRequest) {
    return session.outgoingInviteRequest.callId;
  }
  return `sipjs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

