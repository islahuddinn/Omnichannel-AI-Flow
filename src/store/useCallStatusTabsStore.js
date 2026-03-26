// src/store/useCallStatusTabsStore.js
// Call center: UI state for the call status tabs (missed/no-answer completed calls + active call selection).

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { detectCallDirection, formatCallDuration, determineCallStatus } from '@/utils/callCenter/callUtils';

/**
 * Call Status Tabs Store - Manages completed calls and active call selection.
 * Migrated from Jotai atoms to Zustand.
 */
export const useCallStatusTabsStore = create(
  devtools(
    (set, get) => ({
      // Completed calls state
      completedCalls: [],
      completedCallPhoneNumbers: new Map(), // callId -> phoneNumber
      completedCallDirections: new Map(), // callId -> direction
      completedCallBackendIds: new Map(), // callId -> backendId
      
      // Active call selection
      selectedActiveCallIndex: 0,
      
      // Previous state tracking (for detecting completed calls)
      previousActiveCallIds: [],
      previousPhoneNumbers: new Map(),
      previousCallStatuses: new Map(),
      previousCallDurations: new Map(),
      previousCallDirections: new Map(),
      
      // Actions
      setCompletedCalls: (calls) => set({ completedCalls: calls }),
      
      setCompletedCallPhoneNumbers: (phoneNumbers) => 
        set({ completedCallPhoneNumbers: phoneNumbers }),
      
      setCompletedCallDirections: (directions) => 
        set({ completedCallDirections: directions }),
      
      setCompletedCallBackendIds: (backendIds) => 
        set({ completedCallBackendIds: backendIds }),
      
      setSelectedActiveCallIndex: (index) => set({ selectedActiveCallIndex: index }),
      
      // Update previous state tracking
      updatePreviousState: ({ activeCallIds, phoneNumbers, callStatuses, callDurations, callDirections }) => {
        set({
          previousActiveCallIds: [...activeCallIds],
          previousPhoneNumbers: new Map(phoneNumbers),
          previousCallStatuses: new Map(callStatuses),
          previousCallDurations: new Map(callDurations),
          previousCallDirections: new Map(callDirections),
        });
      },
      
      // Add completed call
      addCompletedCall: async (callData) => {
        const state = get();
        const {
          completedCalls,
          completedCallPhoneNumbers,
          completedCallDirections,
          completedCallBackendIds,
        } = state;
        
        // Use utils for better data processing
        const direction = callData.direction || 'outgoing';
        const duration = callData.duration || 0;
        // The status passed is the raw finalStatus (like "Call ended", "Call terminated", etc.)
        const rawStatus = callData.status || 'Call ended';
        
        // Use utility to determine standardized call status
        // This checks duration > 0 first, which is the correct logic
        // If duration > 0, the call was answered and connected
        const callStatus = determineCallStatus(direction, rawStatus, duration);
        
        // Display status mapping helper
        const getDisplayStatus = (callStatus, direction, duration) => {
          const statusMap = {
            'answered': direction === 'incoming' ? 'Incoming Completed' : 'Outgoing Completed',
            'missed': 'Missed Call',
            'no_answer': 'Not Answered'
          };
          return statusMap[callStatus] || callStatus;
        };
        
        // Check if this call should be shown in completed calls
        // Only show missed/unanswered calls
        const shouldShowCompletedCall = (callStatus) => {
          return callStatus === 'missed' || callStatus === 'no_answer';
        };
        
        if (!shouldShowCompletedCall(callStatus)) {
          console.log(`⏭️ Skipping completed call (answered call): ${callStatus}`, {
            direction,
            duration: formatCallDuration(duration),
            phoneNumber: callData.phoneNumber || 'Unknown'
          });
          return null; // Don't add answered/completed calls - return null to prevent backend save
        }
        
        // Double-check: Ensure we never process answered calls
        if (callStatus === 'answered') {
          console.warn(`🚫 CRITICAL: Attempted to add answered call to completed calls. Blocked.`, {
            direction,
            duration: formatCallDuration(duration),
            phoneNumber: callData.phoneNumber || 'Unknown',
            rawStatus
          });
          return null; // Block answered calls
        }
        
        const displayStatus = getDisplayStatus(callStatus, direction, duration);
        
        const newCall = {
          id: callData.id || `completed-${Date.now()}`,
          status: displayStatus,
          phoneNumber: callData.phoneNumber || 'Unknown',
          direction: direction,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          duration: duration,
          timestamp: Date.now(),
          rawStatus: rawStatus,
          callStatus: callStatus
        };
        
        // Store phone number and direction separately to prevent loss
        const newCompletedPhoneNumbers = new Map(completedCallPhoneNumbers);
        newCompletedPhoneNumbers.set(newCall.id, newCall.phoneNumber);
        
        const newCompletedDirections = new Map(completedCallDirections);
        newCompletedDirections.set(newCall.id, newCall.direction);
        
        // Keep only last 10 completed calls to prevent memory buildup
        const updatedCalls = [newCall, ...completedCalls].slice(0, 10);
        
        set({
          completedCalls: updatedCalls,
          completedCallPhoneNumbers: newCompletedPhoneNumbers,
          completedCallDirections: newCompletedDirections,
        });
        
        // Return newCall - component will handle backend save with additional checks
        return newCall;
      },
      
      // Remove completed call
      removeCompletedCall: (callId) => {
        const state = get();
        const {
          completedCalls,
          completedCallPhoneNumbers,
          completedCallDirections,
          completedCallBackendIds,
        } = state;
        
        const updatedCalls = completedCalls.filter(call => call.id !== callId);
        
        const newCompletedPhoneNumbers = new Map(completedCallPhoneNumbers);
        newCompletedPhoneNumbers.delete(callId);
        
        const newCompletedDirections = new Map(completedCallDirections);
        newCompletedDirections.delete(callId);
        
        const newBackendIds = new Map(completedCallBackendIds);
        newBackendIds.delete(callId);
        
        set({
          completedCalls: updatedCalls,
          completedCallPhoneNumbers: newCompletedPhoneNumbers,
          completedCallDirections: newCompletedDirections,
          completedCallBackendIds: newBackendIds,
        });
        
        return completedCallBackendIds.get(callId); // Return backend ID for deletion
      },
      
      // Get formatted active call data
      getFormattedCallData: (sessions, statuses, phoneNumbers, durations, holdStates, activeCallIds) => {
        return activeCallIds.map(sessionId => {
          const session = sessions.get(sessionId);
          const status = statuses.get(sessionId) || 'Unknown';
          
          // Use utility function for direction detection
          const detection = detectCallDirection(session, status);
          const direction = detection.direction;
          const detectionMethod = detection.detectionMethod;
          
          const duration = durations.get(sessionId) || 0;
          
          console.log(`🔧 PRODUCTION-SAFE Direction Fix for ${sessionId} (using utils):`, {
            sessionType: session?.constructor.name,
            status,
            finalDirection: direction,
            detectionMethod,
            duration: formatCallDuration(duration),
            hasIncomingInviteRequest: !!session?.incomingInviteRequest,
            hasOutgoingInviteRequest: !!session?.outgoingInviteRequest,
            hasAutoSendProvisional: session?.autoSendAnInitialProvisionalResponse !== undefined,
            hasOutgoingDelegate: session?.outgoingRequestDelegate !== undefined
          });
          
          return {
            id: sessionId,
            status: status,
            phoneNumber: phoneNumbers.get(sessionId) || 'Unknown',
            direction: direction,
            duration: duration,
            isOnHold: holdStates.get(sessionId) || false,
            session,
            detectionMethod: detectionMethod,
            formattedDuration: formatCallDuration(duration)
          };
        });
      },
    }),
    { name: 'CallStatusTabsStore' }
  )
);
