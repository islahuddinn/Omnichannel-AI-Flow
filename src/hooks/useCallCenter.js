// src/hooks/useCallCenter.js
// Call center: SIP/WebRTC lifecycle (UserAgents, registration, calls), media, and call actions (make, answer, hangup, hold, transfer).

'use client';

import { useEffect, useRef } from 'react';
// import { useQuery } from '@tanstack/react-query';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { jwtDecode } from 'jwt-decode';
import {
  UserAgent,
  Registerer,
  RegistererState,
  Inviter,
  Invitation,
  SessionState,
} from 'sip.js';
import { useCallCenterStore } from '@/store/useCallCenterStore';
import { useAuth } from '@/hooks/useAuth';
import useUserStore from '@/store/useUserStore';
import { useUserStatus } from '@/hooks/useUserStatus';
import { getIp } from '@/utils/callCenter/getIp';
import apiClient from "@/lib/api/client";

const CONNECTION_SETTINGS = {
  WEBSOCKET_URL: process.env.NEXT_PUBLIC_PBX_WEBSOCKET_URL,
  DOMAIN: process.env.NEXT_PUBLIC_PBX_DOMAIN,
};

const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
  { urls: ['stun:stun2.l.google.com:19302'] }
];

// Helper functions
const generateSessionId = (session) => {
  if (session.dialog?.callId) {
    return session.dialog.callId;
  }
  if (session.request?.callId) {
    return session.request.callId;
  }
  if (session instanceof Invitation && session.incomingInviteRequest) {
    return session.incomingInviteRequest.callId;
  }
  if (session instanceof Inviter && session.outgoingInviteRequest) {
    return session.outgoingInviteRequest.callId;
  }
  return `sipjs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const formatPhoneNumber = (number) => {
  if (!number) return '';
  let formatted = number.trim();
  formatted = formatted.replace(/[^\d+]/g, '');
  if (formatted.startsWith('+')) {
    formatted = '00' + formatted.substring(1);
  } else if (!formatted.startsWith('00') && formatted.length > 4) {
    formatted = '00' + formatted;
  }
  return formatted;
};

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Helper to determine if status requires registration
const shouldBeRegistered = (status) => {
  return ['available', 'outbound', 'occupied'].includes(status);
};

const shouldBeUnregistered = (status) => {
  return ['notavailable', 'offline'].includes(status);
};

// Main frontend orchestrator for SIP registration, call lifecycle, and media handling.
export const useCallCenter = () => {
  const { user } = useAuth();
  const { updateCallStatusAsync, updateMessageStatusAsync, updateBothStatuses } = useUserStatus();

  // Get state and setters from store
  const extensions = useCallCenterStore((state) => state.extensions);
  const userAgents = useCallCenterStore((state) => state.userAgents);
  const registrationStatuses = useCallCenterStore((state) => state.registrationStatuses);
  const selectedExtension = useCallCenterStore((state) => state.selectedExtension);
  const availableOutboundNumbers = useCallCenterStore((state) => state.availableOutboundNumbers);
  const selectedOutboundNumber = useCallCenterStore((state) => state.selectedOutboundNumber);
  const callSessions = useCallCenterStore((state) => state.callSessions);
  const callStatuses = useCallCenterStore((state) => state.callStatuses);
  const phoneNumbers = useCallCenterStore((state) => state.phoneNumbers);
  const callDurations = useCallCenterStore((state) => state.callDurations);
  const isMuted = useCallCenterStore((state) => state.isMuted);
  const isOnHold = useCallCenterStore((state) => state.isOnHold);
  const callErrors = useCallCenterStore((state) => state.callErrors);
  const incomingCallExtensions = useCallCenterStore((state) => state.incomingCallExtensions);
  const activeCallIds = useCallCenterStore((state) => state.activeCallIds);
  const showCallModal = useCallCenterStore((state) => state.showCallModal);
  const localStream = useCallCenterStore((state) => state.localStream);
  const remoteAudioRef = useCallCenterStore((state) => state.remoteAudioRef);
  const localAudioRef = useCallCenterStore((state) => state.localAudioRef);

  // Store setters
  const setExtensions = useCallCenterStore((state) => state.setExtensions);
  const setUserAgents = useCallCenterStore((state) => state.setUserAgents);
  const setRegistrationStatuses = useCallCenterStore((state) => state.setRegistrationStatuses);
  const setSelectedExtension = useCallCenterStore((state) => state.setSelectedExtension);
  const addSession = useCallCenterStore((state) => state.addSession);
  const updateSessionStatus = useCallCenterStore((state) => state.updateSessionStatus);
  const removeSession = useCallCenterStore((state) => state.removeSession);
  const setShowCallModal = useCallCenterStore((state) => state.setShowCallModal);
  const setLocalStream = useCallCenterStore((state) => state.setLocalStream);
  const setClientIp = useCallCenterStore((state) => state.setClientIp);
  const setActionMethods = useCallCenterStore((state) => state.setActionMethods);

  // Refs for tracking
  const userMediaStreamRef = useRef(null);
  const userMediaPromiseRef = useRef(null);
  const previousCallStatusRef = useRef(null);
  const sessionIntervalsRef = useRef(new Map());
  const previousExtensionsRef = useRef([]);

  const queryClient = useQueryClient();
  const cachedProfile = queryClient.getQueryData(['user-profile']);

  // Fetch user profile to get extensions
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {

      const response = await apiClient.get('/users/profile');

      console.log(response,"response from user profile useCallCenter")
      return response.data;
    },
    // enabled: !!user || !!cachedProfile, // Enable if user exists OR cached data exists
    // initialData: cachedProfile, // Use cached data immediately if available
    staleTime: 300000,
    refetchOnMount: true, // Ensure it refetches on mount
    refetchOnWindowFocus: true, // Ensure it refetches on window focus
    retry: 2,
    retryDelay: 1000,
  });


  // Initialize extensions from user profile - do this immediately when profile loads
  useEffect(() => {
    if (userProfile?.pbx_extension) {
      const extensionData = userProfile.pbx_extension;

      // Only set extensions if they're different to avoid unnecessary re-initialization
      const newExtensions = [{
        extension: extensionData.internal_extension.toString(),
        username: extensionData.sip_username,
        password: extensionData.sip_password,
        isPrimary: true
      }];

      // Check if extensions have changed
      const currentExtension = extensions[0];
      const hasChanged = !currentExtension ||
        currentExtension.extension !== newExtensions[0].extension ||
        currentExtension.username !== newExtensions[0].username;

      if (hasChanged) {
        console.log('📞 Initializing extensions from user profile:', newExtensions);
        setExtensions(newExtensions);

        // Set default selected extension immediately
        if (!selectedExtension && newExtensions.length > 0) {
          setSelectedExtension(newExtensions[0]);
        }
      }
    }
  }, [userProfile, setExtensions, selectedExtension, setSelectedExtension, extensions]);

  // Get current call status from localStorage
  const getCurrentCallStatus = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('callStatus') || 'available';
    }
    return 'available';
  };

  const currentCallStatus = getCurrentCallStatus();

  // Setup audio streams - exactly like old code
  const setupAudioStreams = async (session, sessionId) => {
    try {
      console.log(`Setting up audio streams for session ${sessionId}`);

      const sessionDescriptionHandler = session.sessionDescriptionHandler;
      if (!sessionDescriptionHandler || !sessionDescriptionHandler.peerConnection) {
        console.error('No session description handler or peer connection found');
        return;
      }

      const pc = sessionDescriptionHandler.peerConnection;

      // Get fresh refs from store (like old code pattern)
      const state = useCallCenterStore.getState();
      const currentRemoteAudioRef = state.remoteAudioRef;
      const currentLocalAudioRef = state.localAudioRef;
      const currentLocalStream = state.localStream;

      // Set up remote audio - handle new tracks and existing receivers
      const handleTrack = (event) => {
        console.log('New track received:', event.track.kind);
        if (event.track.kind === 'audio') {
          // Get fresh ref from store
          const freshState = useCallCenterStore.getState();
          const remoteAudio = freshState.remoteAudioRef?.current;

          if (remoteAudio) {
            const stream = new MediaStream([event.track]);
            remoteAudio.srcObject = stream;
            remoteAudio.volume = 1.0;

            const playPromise = remoteAudio.play();
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                console.error('Error playing remote audio:', error);
              });
            }
          }
        }
      };

      // Set up existing receivers first (like old code)
      pc.getReceivers().forEach(receiver => {
        if (receiver.track && receiver.track.kind === 'audio') {
          const stream = new MediaStream([receiver.track]);
          const remoteAudio = currentRemoteAudioRef?.current;

          if (remoteAudio) {
            console.log('Setting up remote audio from existing receiver');
            remoteAudio.srcObject = stream;
            remoteAudio.volume = 1.0;
            remoteAudio.play().catch(error => {
              console.error('Error playing remote audio from receiver:', error);
            });
          } else {
            console.warn('Remote audio element not available for receiver track');
          }
        }
      });

      // Set up track handler for new tracks (like old code)
      pc.ontrack = handleTrack;

      // Also check for tracks that might arrive after setup
      if (pc.getReceivers().length === 0) {
        console.log('No receivers yet, will set up when tracks arrive');
      }

      // Set up local audio element with local stream
      if (currentLocalStream && currentLocalAudioRef?.current) {
        currentLocalAudioRef.current.srcObject = currentLocalStream;
        currentLocalAudioRef.current.muted = true;
      }

      // Wait for ICE gathering if available
      if (typeof sessionDescriptionHandler.iceGatheringComplete === 'function') {
        try {
          await sessionDescriptionHandler.iceGatheringComplete();
          console.log('ICE gathering completed');
        } catch (error) {
          console.warn('ICE gathering completion failed:', error);
        }
      }
    } catch (error) {
      console.error('Error setting up audio streams:', error);
    }
  };

  // Initialize user media
  const initializeUserMedia = async () => {
    try {
      if (userMediaStreamRef.current) {
        return userMediaStreamRef.current;
      }

      if (userMediaPromiseRef.current) {
        return userMediaPromiseRef.current;
      }

      console.log('Getting user media...');
      userMediaPromiseRef.current = navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          latency: 0.01,
          sampleRate: 48000,
          channelCount: 1
        },
        video: false
      }).then(stream => {
        console.log('User media obtained');
        userMediaStreamRef.current = stream;
        userMediaPromiseRef.current = null;
        setLocalStream(stream);

        if (localAudioRef?.current) {
          localAudioRef.current.srcObject = stream;
          localAudioRef.current.muted = true;
        }

        return stream;
      }).catch(error => {
        console.error('Failed to get user media:', error);
        userMediaPromiseRef.current = null;
        return null;
      });

      return userMediaPromiseRef.current;
    } catch (error) {
      console.error('Error accessing user media:', error);
      return null;
    }
  };

  // Pre-initialize user media
  useEffect(() => {
    if (userProfile?.call_center === 'on') {
      const timeoutId = setTimeout(() => {
        initializeUserMedia();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [userProfile]);

  // Get config for extension
  const getConfig = (extension) => {
    const uri = UserAgent.makeURI(`sip:${extension.username}@${CONNECTION_SETTINGS.DOMAIN}`);

    return {
      uri,
      authorizationUsername: extension.username,
      authorizationPassword: extension.password,
      displayName: extension.username,
      hackIpInContact: true,
      contactParams: { transport: 'wss' },
      refreshFrequency: 0.8,
      expires:600,
      noAnswerTimeout: 120,
      transportOptions: {
        server: CONNECTION_SETTINGS.WEBSOCKET_URL,
        connectionTimeout: 15,
        maxReconnectionAttempts: 3,
        reconnectionTimeout: 4,
        traceSip: false,
        keepAliveInterval: 30,
      },
      sessionDescriptionHandlerFactoryOptions: {
        constraints: {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            latency: 0.01,
            sampleRate: 48000,
            channelCount: 1
          },
          video: false
        },
        peerConnectionConfiguration: {
          iceServers: ICE_SERVERS,
          bundlePolicy: 'balanced'
        },
        iceGatheringTimeout: 500
      },
      delegate: {
        onConnect: () => {
          console.log(`[${extension.extension}] Connected to WebSocket`);
        },
        onDisconnect: (error) => {
          console.log(`[${extension.extension}] Disconnected from WebSocket:`, error);
        },
        onInvite: (invitation) => {
          console.log(`[${extension.extension}] Incoming call received`);
          handleNewRTCSession(invitation, extension);
        }
      }
    };
  };

  // Setup user agent event handlers
  const setupUserAgentEventHandlers = (userAgent, extension) => {
    userAgent.transport.onConnect = () => {
      console.log(`[${extension.extension}] UA Connected to WebSocket successfully`);
      const newStatuses = new Map(registrationStatuses);
      newStatuses.set(extension.extension, 'connected');
      setRegistrationStatuses(newStatuses);

      setTimeout(() => {
        // Check if userAgent is still valid and not disposed
        if (!userAgent || userAgent.state === 'Stopped' || userAgent.state === 'Terminated') {
          console.log(`[${extension.extension}] UserAgent no longer valid, skipping auto-registration`);
          return;
        }

        if (shouldBeRegistered(currentCallStatus) &&
          userAgent.registerer &&
          userAgent.registerer.state !== RegistererState.Registered &&
          userAgent.registerer.state !== RegistererState.Registering &&
          userAgent.registerer.state !== RegistererState.Terminated) {
          console.log(`[${extension.extension}] Auto-registering`);
          try {
            userAgent.registerer.register().catch(error => {
              console.error(`[${extension.extension}] Auto-registration failed:`, error);
              const errorStatuses = new Map(registrationStatuses);
              errorStatuses.set(extension.extension, `auto_register_error: ${error.message}`);
              setRegistrationStatuses(errorStatuses);
            });
            const registeringStatuses = new Map(registrationStatuses);
            registeringStatuses.set(extension.extension, 'registering');
            setRegistrationStatuses(registeringStatuses);
          } catch (error) {
            console.error(`[${extension.extension}] Auto-registration failed:`, error);
          }
        }
      }, 200);
    };

    // userAgent.transport.onDisconnect = (error) => {
    //   console.log(`[${extension.extension}] UA Disconnected:`, error);
    //   const newStatuses = new Map(registrationStatuses);
    //   newStatuses.set(extension.extension, 'disconnected');
    //   setRegistrationStatuses(newStatuses);

    //   if (shouldBeRegistered(currentCallStatus)) {
    //     setTimeout(() => {
    //       console.log(`[${extension.extension}] Attempting to reconnect...`);
    //       if (userAgent && !userAgent.isConnected()) {
    //         userAgent.start().catch(error => {
    //           console.error(`[${extension.extension}] Reconnection failed:`, error);
    //           const errorStatuses = new Map(registrationStatuses);
    //           errorStatuses.set(extension.extension, `reconnect_error: ${error.message}`);
    //           setRegistrationStatuses(errorStatuses);
    //         });
    //       }
    //     }, 1000);
    //   }
    // };


    userAgent.transport.onDisconnect = (error) => {
      console.log(`[${extension.extension}] UA Disconnected:`, error);
    
      const newStatuses = new Map(registrationStatuses);
      newStatuses.set(extension.extension, 'disconnected');
      setRegistrationStatuses(newStatuses);
    
      // Always try to reconnect & re-register
      setTimeout(async () => {
        if (!userAgent || userAgent.state === 'Stopped' || userAgent.state === 'Terminated') {
          console.log(`[${extension.extension}] UA no longer valid, skipping reconnect`);
          return;
        }
    
        console.log(`[${extension.extension}] Attempting to reconnect UA...`);
        try {
          await userAgent.start(); // restart transport
          console.log(`[${extension.extension}] UA restarted successfully`);
    
          // Ensure registerer exists and register
          if (userAgent.registerer &&
              userAgent.registerer.state !== RegistererState.Registered &&
              userAgent.registerer.state !== RegistererState.Registering) {
            await userAgent.registerer.register();
            console.log(`[${extension.extension}] UA re-registered successfully`);
            const reRegisteredStatuses = new Map(registrationStatuses);
            reRegisteredStatuses.set(extension.extension, 'registered');
            setRegistrationStatuses(reRegisteredStatuses);
          }
        } catch (reconnectError) {
          console.error(`[${extension.extension}] UA reconnect/register failed:`, reconnectError);
          const errorStatuses = new Map(registrationStatuses);
          errorStatuses.set(extension.extension, `reconnect_error: ${reconnectError.message}`);
          setRegistrationStatuses(errorStatuses);
        }
      }, 2000); // 2s delay before retry
    };
    

    // Registerer state change handler
    if (userAgent.registerer) {
      userAgent.registerer.stateChange.addListener((state) => {
        console.log(`[${extension.extension}] Registration state changed to: ${state}`);
        const newStatuses = new Map(registrationStatuses);

        switch (state) {
          case RegistererState.Initial:
            newStatuses.set(extension.extension, 'initializing');
            break;
          case RegistererState.Registering:
            newStatuses.set(extension.extension, 'registering');
            break;
          case RegistererState.Registered:
            newStatuses.set(extension.extension, 'registered');
            break;
          case RegistererState.Unregistering:
            newStatuses.set(extension.extension, 'unregistering');
            break;
          case RegistererState.Unregistered:
            newStatuses.set(extension.extension, 'unregistered');
            break;
          case RegistererState.Terminated:
            newStatuses.set(extension.extension, 'terminated');
            break;
        }
        setRegistrationStatuses(newStatuses);
      });

      userAgent.registerer.onReject = (response) => {
        console.error(`[${extension.extension}] Registration failed:`, {
          status: response.message.statusCode,
          reason: response.message.reasonPhrase
        });
        const newStatuses = new Map(registrationStatuses);
        newStatuses.set(extension.extension, `failed: ${response.message.reasonPhrase}`);
        setRegistrationStatuses(newStatuses);
      };
    }

    userAgent.delegate = {
      onInvite: (invitation) => {
        console.log(`[${extension.extension}] New incoming call`);
        handleNewRTCSession(invitation, extension);
      }
    };
  };

  // Handle new RTC session
  const handleNewRTCSession = async (newSession, extension) => {
    console.log(`[${extension.extension}] New RTC Session: ${newSession instanceof Invitation ? 'incoming' : 'outgoing'}`);

    const sessionId = generateSessionId(newSession);

    if (newSession instanceof Invitation) {
      const remoteIdentity = newSession.remoteIdentity;
      const phoneNumber = remoteIdentity.uri.user;
      const xTo = newSession?.request?.getHeader('X-To');

      addSession({
        session: newSession,
        status: `Incoming call on ${xTo} from ${phoneNumber}`,
        phoneNumber,
        extension
      });

      setShowCallModal(true);

      // ✅ Create conversation for incoming call in real-time
      // Use IIFE to run async without blocking
      (async () => {
        try {
          console.log('📞 [useCallCenter] Creating conversation for incoming call...', {
            phoneNumber,
            extension: extension.extension
          });

          // Get auth token from localStorage (API client uses this)
          let currentToken = null;
          if (typeof window !== 'undefined') {
            currentToken = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
          }

          // Fallback to userStore token if localStorage doesn't have it
          if (!currentToken) {
            const userStore = useUserStore.getState();
            currentToken = userStore?.token;
          }

          console.log('📞 [useCallCenter] Token check:', {
            hasToken: !!currentToken,
            tokenSource: currentToken ? (localStorage.getItem('accessToken') ? 'localStorage' : 'userStore') : 'none'
          });

          if (currentToken) {
            // Get tenant ID from token
            try {
              const decodedToken = jwtDecode(currentToken);
              const tenantId = decodedToken?.companyId || decodedToken?.tenantId;

              console.log('📞 [useCallCenter] Decoded token:', {
                tenantId,
                companyId: decodedToken?.companyId,
                hasCompanyId: !!decodedToken?.companyId,
                hasTenantId: !!decodedToken?.tenantId
              });

              if (tenantId) {
                // Call API to create conversation and contact in real-time

                console.log('📞 [useCallCenter] Calling API endpoint...');

                // Get the agent's current/selected department
                const { useDepartmentStore } = await import('@/store/useDepartmentStore');
                const deptState = useDepartmentStore.getState();
                const selectedDept = deptState?.selectedDepartment;
                const userState = useUserStore.getState();
                const agentDepartments = userState?.user?.departments || decodedToken?.departments || [];
                // Priority: selected department > first department from user profile
                const currentDepartmentId = selectedDept?._id
                  || (agentDepartments.length > 0
                    ? (typeof agentDepartments[0] === 'object' ? agentDepartments[0]._id : agentDepartments[0])
                    : null);

                const response = await apiClient.post('/conversations/create-from-call', {
                  phoneNumber: phoneNumber, // Will be normalized on server (handles +, 00, etc.)
                  channelAccountId: null, // Can be enhanced later to link to specific phone number account
                  departmentId: currentDepartmentId // Use agent's department to ensure correct access
                });

                console.log('✅ [useCallCenter] Call conversation creation successful:', response);
              } else {
                console.warn('⚠️ [useCallCenter] No tenant ID found in token, skipping conversation creation');
              }
            } catch (tokenError) {
              console.error('❌ [useCallCenter] Error decoding token:', tokenError);
            }
          } else {
            console.warn('⚠️ [useCallCenter] No auth token found, skipping conversation creation');
          }
        } catch (error) {
          // Don't block call flow if conversation creation fails
          console.error('❌ [useCallCenter] Failed to create call conversation (non-blocking):', error);
          console.error('❌ [useCallCenter] Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
          });
        }
      })();

      // Update call status to occupied
      const currentCallStatus = localStorage.getItem('callStatus');
      const currentMessageStatus = localStorage.getItem('messageStatus');

      if (currentCallStatus !== 'occupied' || currentMessageStatus !== 'occupied') {
        if (currentCallStatus && currentCallStatus !== 'occupied') {
          localStorage.setItem('previousCallStatus', currentCallStatus);
        }
        if (currentMessageStatus && currentMessageStatus !== 'occupied') {
          localStorage.setItem('previousMessageStatus', currentMessageStatus);
        }
        // Update both statuses using the hook
        updateBothStatuses({
          callStatus: 'occupied',
          messageStatus: currentMessageStatus !== 'viewonly' ? 'occupied' : null,
          savePrevious: true
        }).catch(error => {
          console.error('Error updating status to occupied:', error);
        });
      }
    }

    setupSessionEventHandlers(newSession, sessionId);
  };

  // Setup session event handlers
  const setupSessionEventHandlers = (session, sessionId) => {
    if (session._eventHandlersSetup) {
      return;
    }

    session.stateChange.addListener((state) => {
      console.log(`Session ${sessionId} state changed to:`, state);

      switch (state) {
        case SessionState.Initial:
          updateSessionStatus({ sessionId, status: 'Connecting...' });
          break;
        case SessionState.Establishing:
          updateSessionStatus({ sessionId, status: 'Ringing...' });

          const currentCallStatus = localStorage.getItem('callStatus');
          const currentMessageStatus = localStorage.getItem('messageStatus');

          // Update both statuses using the hook
          if (currentCallStatus !== 'occupied' ||
            (currentMessageStatus !== 'occupied' && currentMessageStatus !== 'viewonly')) {
            updateBothStatuses({
              callStatus: currentCallStatus !== 'occupied' ? 'occupied' : null,
              messageStatus: (currentMessageStatus !== 'occupied' && currentMessageStatus !== 'viewonly') ? 'occupied' : null,
              savePrevious: true
            }).catch(error => {
              console.error('Error updating status to occupied:', error);
            });
          }
          break;
        case SessionState.Established:
          console.log(`[${sessionId}] Session state changed to Established - updating status to 'Call connected'`);
          updateSessionStatus({ sessionId, status: 'Call connected' });
          console.log(`[${sessionId}] Status updated to 'Call connected'`);
          setShowCallModal(true);

          // Start call duration timer - using getState to get fresh state (like old code)
          console.log(`Starting call duration timer for session ${sessionId}`);
          const intervalId = setInterval(() => {
            const state = useCallCenterStore.getState();
            const currentDurations = new Map(state.callDurations);
            const currentDuration = currentDurations.get(sessionId) || 0;
            currentDurations.set(sessionId, currentDuration + 1);
            useCallCenterStore.setState({ callDurations: currentDurations });
          }, 1000);

          sessionIntervalsRef.current.set(sessionId, intervalId);
          console.log(`Call duration timer started for session ${sessionId}`);

          // CRITICAL: Setup audio streams immediately (like old code)
          setupAudioStreams(session, sessionId);

          // Backup audio setup with minimal delay (like old code)
          setTimeout(() => {
            setupAudioStreams(session, sessionId);
          }, 100);
          break;
        case SessionState.Terminating:
          updateSessionStatus({ sessionId, status: 'Ending call...' });

          const terminatingIntervalId = sessionIntervalsRef.current.get(sessionId);
          if (terminatingIntervalId) {
            clearInterval(terminatingIntervalId);
            sessionIntervalsRef.current.delete(sessionId);
          }
          break;
        case SessionState.Terminated:
          console.log(`Call ${sessionId} terminated`);
          updateSessionStatus({ sessionId, status: 'Call ended' });

          const terminatedIntervalId = sessionIntervalsRef.current.get(sessionId);
          if (terminatedIntervalId) {
            clearInterval(terminatedIntervalId);
            sessionIntervalsRef.current.delete(sessionId);
          }

          removeSession(sessionId);

          // Restore previous status if no more active calls
          setTimeout(() => {
            if (sessionIntervalsRef.current.size < 1) {
              const previousCallStatus = localStorage.getItem('previousCallStatus');
              const previousMessageStatus = localStorage.getItem('previousMessageStatus');
              const newCallStatus = previousCallStatus || 'available';
              const newMessageStatus = previousMessageStatus || 'available';

              // Update both statuses using the hook
              updateBothStatuses({
                callStatus: newCallStatus,
                messageStatus: newMessageStatus,
                savePrevious: false // Don't save previous since we're restoring
              }).catch(error => {
                console.error('Error updating status after call end:', error);
              });
            }
          }, 100);
          break;
      }
    });

    // Handle outgoing call responses
    if (session instanceof Inviter) {
      session.outgoingRequestDelegate = {
        onProgress: (response) => {
          console.log(`Call ${sessionId} progress - ringing:`, response.message.statusCode);
          updateSessionStatus({ sessionId, status: 'Ringing...' });

          const currentCallStatus = localStorage.getItem('callStatus');
          const currentMessageStatus = localStorage.getItem('messageStatus');

          if (currentCallStatus !== 'occupied' || currentMessageStatus !== 'occupied') {
            if (currentCallStatus && currentCallStatus !== 'occupied') {
              localStorage.setItem('previousCallStatus', currentCallStatus);
            }
            if (currentMessageStatus && currentMessageStatus !== 'occupied') {
              localStorage.setItem('previousMessageStatus', currentMessageStatus);
            }
            // Update both statuses using the hook
            if (currentCallStatus !== 'occupied' ||
              (currentMessageStatus !== 'occupied' && currentMessageStatus !== 'viewonly')) {
              updateBothStatuses({
                callStatus: currentCallStatus !== 'occupied' ? 'occupied' : null,
                messageStatus: (currentMessageStatus !== 'occupied' && currentMessageStatus !== 'viewonly') ? 'occupied' : null,
                savePrevious: true
              }).catch(error => {
                console.error('Error updating status to occupied:', error);
              });
            }
          }
        },
        onAccept: (response) => {
          console.log(`[${sessionId}] onAccept - updating status to 'Call accepted'`);
          updateSessionStatus({ sessionId, status: 'Call accepted' });
          console.log(`[${sessionId}] Status updated to 'Call accepted'`);
        },
        onReject: (response) => {
          console.error(`Call ${sessionId} rejected:`, response.message.statusCode, response.message.reasonPhrase);
          updateSessionStatus({ sessionId, status: `Call failed: ${response.message.reasonPhrase}` });

          const rejectedIntervalId = sessionIntervalsRef.current.get(sessionId);
          if (rejectedIntervalId) {
            clearInterval(rejectedIntervalId);
            sessionIntervalsRef.current.delete(sessionId);
          }

          removeSession(sessionId);

          setTimeout(() => {
            if (activeCallIds.length < 1) {
              const previousCallStatus = localStorage.getItem('previousCallStatus');
              const previousMessageStatus = localStorage.getItem('previousMessageStatus');
              const newCallStatus = previousCallStatus || 'available';
              const newMessageStatus = previousMessageStatus || 'available';

              // Update both statuses using the hook
              updateBothStatuses({
                callStatus: newCallStatus,
                messageStatus: newMessageStatus,
                savePrevious: false // Don't save previous since we're restoring
              }).catch(error => {
                console.error('Error updating status after call reject:', error);
              });
            }
          }, 100);
        },
        onTrying: (response) => {
          console.log(`[${sessionId}] onTrying - updating status to 'Trying...'`);
          updateSessionStatus({ sessionId, status: 'Trying...' });
          console.log(`[${sessionId}] Status updated to 'Trying...'`);
        }
      };
    }

    // Handle incoming call cancellation
    if (session instanceof Invitation) {
      session.delegate = {
        onCancel: (message) => {
          console.log(`Incoming call ${sessionId} was cancelled by caller`);
          updateSessionStatus({ sessionId, status: 'Call cancelled' });

          const cancelledIntervalId = sessionIntervalsRef.current.get(sessionId);
          if (cancelledIntervalId) {
            clearInterval(cancelledIntervalId);
            sessionIntervalsRef.current.delete(sessionId);
          }

          removeSession(sessionId);

          setTimeout(() => {
            const currentSessions = useCallCenterStore.getState().callSessions;
            if (currentSessions.size === 0) {
              const previousCallStatus = localStorage.getItem('previousCallStatus');
              const previousMessageStatus = localStorage.getItem('previousMessageStatus');
              const newCallStatus = previousCallStatus || 'available';
              const newMessageStatus = previousMessageStatus || 'available';

              // Update both statuses using the hook
              updateBothStatuses({
                callStatus: newCallStatus,
                messageStatus: newMessageStatus,
                savePrevious: false // Don't save previous since we're restoring
              }).catch(error => {
                console.error('Error updating status after call cancel:', error);
              });
            }
          }, 150);
        }
      };
    }

    // Handle BYE requests
    const originalDelegate = session.delegate || {};
    session.delegate = {
      ...originalDelegate,
      onBye: (request) => {
        console.log(`Remote party ended call ${sessionId} via BYE request`);
        updateSessionStatus({ sessionId, status: 'Call ended by remote party' });

        const byeIntervalId = sessionIntervalsRef.current.get(sessionId);
        if (byeIntervalId) {
          clearInterval(byeIntervalId);
          sessionIntervalsRef.current.delete(sessionId);
        }

        setTimeout(() => {
          if (session.state === SessionState.Terminated) {
            removeSession(sessionId);

            setTimeout(() => {
              const currentSessions = useCallCenterStore.getState().callSessions;
              if (currentSessions.size === 0) {
                const previousCallStatus = localStorage.getItem('previousCallStatus');
                const previousMessageStatus = localStorage.getItem('previousMessageStatus');
                const newCallStatus = previousCallStatus || 'available';
                const newMessageStatus = previousMessageStatus || 'available';

                // Update both statuses using the hook
                updateBothStatuses({
                  callStatus: newCallStatus,
                  messageStatus: newMessageStatus,
                  savePrevious: false // Don't save previous since we're restoring
                }).catch(error => {
                  console.error('Error updating status after BYE:', error);
                });
              }
            }, 150);
          }
        }, 100);
      }
    };

    session._eventHandlersSetup = true;
  };

  // Initialize all user agents
  const initializeAllUserAgents = async () => {
    try {
      console.log('Initializing all user agents...');

      // Stop existing user agents only if they exist and are different
      const stopPromises = [];
      userAgents.forEach((ua, extension) => {
        try {
          // Check if this extension is still needed
          const stillNeeded = extensions.some(ext => ext.extension === extension);

          if (!stillNeeded) {
            // Extension no longer needed, clean it up
            if (ua.registerer &&
              (ua.registerer.state === RegistererState.Registered ||
                ua.registerer.state === RegistererState.Registering)) {
              // Only unregister if not already in progress
              if (ua.registerer.state !== RegistererState.Registering) {
                stopPromises.push(ua.registerer.unregister().catch(e => {
                  // Ignore "already in progress" errors
                  if (!e.message?.includes('already in progress')) {
                    console.warn(`Error unregistering ${extension}:`, e);
                  }
                }));
              }
            }

            // Only stop if not already stopped
            if (ua.state !== 'Stopped' && ua.state !== 'Terminated') {
              stopPromises.push(ua.stop().catch(e => {
                // Ignore "Invalid state transition" errors
                if (!e.message?.includes('Invalid state transition')) {
                  console.warn(`Error stopping UA ${extension}:`, e);
                }
              }));
            }
          }
        } catch (e) {
          console.warn(`Error stopping existing UA for ${extension}:`, e);
        }
      });

      await Promise.allSettled(stopPromises);

      const newUserAgents = new Map();
      const newStatuses = new Map();

      for (const extension of extensions) {
        console.log(`Initializing extension ${extension.extension}...`);

        // Check if we already have a valid user agent for this extension
        const existingUA = userAgents.get(extension.extension);
        if (existingUA &&
          existingUA.state !== 'Stopped' &&
          existingUA.state !== 'Terminated' &&
          existingUA.isConnected()) {
          console.log(`[${extension.extension}] Reusing existing user agent`);
          newUserAgents.set(extension.extension, existingUA);
          // Keep existing status if registered, otherwise set to connecting
          const existingStatus = registrationStatuses.get(extension.extension);
          if (existingStatus === 'registered') {
            newStatuses.set(extension.extension, 'registered');
          } else {
            newStatuses.set(extension.extension, existingStatus || 'connecting');
          }
          continue;
        }

        try {
          const config = getConfig(extension);
          const userAgent = new UserAgent(config);

          const registerer = new Registerer(userAgent);
          userAgent.registerer = registerer;

          setupUserAgentEventHandlers(userAgent, extension);

          newUserAgents.set(extension.extension, userAgent);
          newStatuses.set(extension.extension, 'initializing');

          if (shouldBeRegistered(currentCallStatus)) {
            console.log(`[${extension.extension}] Starting user agent...`);
            try {
              await userAgent.start();
              newStatuses.set(extension.extension, 'connecting');
            } catch (startError) {
              console.error(`Failed to start UA for extension ${extension.extension}:`, startError);
              newStatuses.set(extension.extension, `start_error: ${startError.message}`);
            }
          } else {
            console.log(`[${extension.extension}] Not starting UA due to status: ${currentCallStatus}`);
            newStatuses.set(extension.extension, 'stopped');
          }
        } catch (error) {
          console.error(`Error initializing extension ${extension.extension}:`, error);
          newStatuses.set(extension.extension, `error: ${error.message}`);
        }
      }

      setUserAgents(newUserAgents);
      setRegistrationStatuses(newStatuses);

      console.log('All user agents initialization completed');
    } catch (error) {
      console.error('Critical error initializing user agents:', error);
    }
  };

  // Initialize user agents when extensions change - reduce delay for faster initialization
  useEffect(() => {
    if (extensions.length > 0) {
      // Check if extensions have actually changed
      const extensionsChanged =
        extensions.length !== previousExtensionsRef.current.length ||
        extensions.some((ext, index) => {
          const prev = previousExtensionsRef.current[index];
          return !prev || ext.extension !== prev.extension || ext.username !== prev.username;
        });

      if (extensionsChanged) {
        console.log('EXTENSIONS changed, initializing user agents...', extensions);
        previousExtensionsRef.current = extensions;
        // Reduce delay to 50ms for faster initialization on first load
        const initTimer = setTimeout(() => {
          initializeAllUserAgents();
        }, 50);

        return () => clearTimeout(initTimer);
      } else {
        console.log('EXTENSIONS unchanged, skipping re-initialization');
      }
    }
  }, [extensions]);

  // Keep SIP registration state aligned with operator availability status.
  useEffect(() => {
    const handleStatusBasedRegistration = async () => {
      const previousStatus = previousCallStatusRef.current;
      const newStatus = currentCallStatus;

      if (previousStatus === newStatus) {
        return;
      }

      previousCallStatusRef.current = newStatus;

      if (extensions.length === 0 || userAgents.size === 0) {
        return;
      }

      const shouldRegister = shouldBeRegistered(newStatus);
      const shouldUnregister = shouldBeUnregistered(newStatus);

      if (shouldUnregister) {
        userAgents.forEach((userAgent, extensionNumber) => {
          try {
            const registererState = userAgent.registerer?.state;
            // Only unregister if registered and not already in progress
            if (registererState === RegistererState.Registered &&
              registererState !== RegistererState.Registering) {
              console.log(`Unregistering extension ${extensionNumber}`);
              userAgent.registerer.unregister().catch(error => {
                // Ignore "already in progress" errors
                if (!error.message?.includes('already in progress')) {
                  console.error(`Failed to unregister extension ${extensionNumber}:`, error);
                  const newStatuses = new Map(registrationStatuses);
                  newStatuses.set(extensionNumber, `unregister_error: ${error.message}`);
                  setRegistrationStatuses(newStatuses);
                }
              });
              const newStatuses = new Map(registrationStatuses);
              newStatuses.set(extensionNumber, 'unregistering');
              setRegistrationStatuses(newStatuses);
            }
          } catch (error) {
            console.error(`Error unregistering extension ${extensionNumber}:`, error);
          }
        });
      } else if (shouldRegister) {
        const needsRegistration = Array.from(userAgents.entries()).some(([extensionNumber, userAgent]) => {
          const registererState = userAgent.registerer?.state;
          return registererState !== RegistererState.Registered &&
            registererState !== RegistererState.Registering;
        });

        if (needsRegistration) {
          userAgents.forEach((userAgent, extensionNumber) => {
            try {
              const registererState = userAgent.registerer?.state;

              if (userAgent.isConnected() &&
                registererState !== RegistererState.Registered &&
                registererState !== RegistererState.Registering) {

                console.log(`Registering extension ${extensionNumber}`);
                userAgent.registerer?.register().catch(error => {
                  console.error(`Failed to register extension ${extensionNumber}:`, error);
                  const newStatuses = new Map(registrationStatuses);
                  newStatuses.set(extensionNumber, `register_error: ${error.message}`);
                  setRegistrationStatuses(newStatuses);
                });
                const newStatuses = new Map(registrationStatuses);
                newStatuses.set(extensionNumber, 'registering');
                setRegistrationStatuses(newStatuses);
              } else if (!userAgent.isConnected()) {
                console.log(`Extension ${extensionNumber} not connected, attempting to start UA`);
                const newStatuses = new Map(registrationStatuses);
                newStatuses.set(extensionNumber, 'connecting');
                setRegistrationStatuses(newStatuses);
                userAgent.start().catch(error => {
                  console.error(`Failed to start UA for extension ${extensionNumber}:`, error);
                  const errorStatuses = new Map(registrationStatuses);
                  errorStatuses.set(extensionNumber, `connect_error: ${error.message}`);
                  setRegistrationStatuses(errorStatuses);
                });
              }
            } catch (error) {
              console.error(`Error registering extension ${extensionNumber}:`, error);
            }
          });
        }
      }
    };

    if (currentCallStatus && userAgents.size > 0) {
      handleStatusBasedRegistration();
    }
  }, [currentCallStatus, userAgents, registrationStatuses, extensions.length]);

  // Register client IP
  useEffect(() => {
    const registerIp = async () => {
      if (userProfile && userProfile.call_center === 'on') {
        console.log('Registering IP...');
        try {
          const ip = await getIp();
          if (ip) {
            await apiClient.post('/users/register-ip', { ip });
            setClientIp(ip);
            console.log('IP registered:', ip);
          }
        } catch (error) {
          console.error('Error registering IP:', error);
        }
      }
    };

    registerIp();

    const handleUnload = () => {
      const ip = useCallCenterStore.getState().clientIp;
      if (ip) {
        apiClient.post('/users/unregister-ip', { ip }).catch(console.error);
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      // const ip = useCallCenterStore.getState().clientIp;
      // if (ip) {
      //   apiClient.post('/users/unregister-ip', { ip }).catch(console.error);
      // }
    };
  }, [userProfile, setClientIp]);

  // Handle tab visibility changes - set offline when tab closes/hidden
  useEffect(() => {
    if (!userProfile || userProfile.call_center !== 'on') {
      return;
    }

    const setStatusToOffline = () => {
      const currentCallStatus = localStorage.getItem('callStatus');
      const currentMessageStatus = localStorage.getItem('messageStatus');

      // Only set offline if not already offline and not occupied (occupied should remain)
      if (currentCallStatus && currentCallStatus !== 'offline' && currentCallStatus !== 'occupied') {
        const userId = user?.id || user?.userId;
        if (!userId) return;

        const statusUpdateData = {
          status: 'offline',
          type: 'call'
        };

        // Use fetch with keepalive for beforeunload events
        // This ensures the request completes even if page unloads
        const url = `${window.location.origin}/api/users/${userId}/status`;
        
        fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(statusUpdateData),
          keepalive: true, // Ensures request continues even if page unloads
          credentials: 'include' // Include cookies for auth
        }).catch((error) => {
          // Silently fail - we can't do anything about it on unload
          console.warn('Could not set status to offline on unload:', error);
        });
      }
    };

    const handleUnload = () => {
      // Use synchronous call for beforeunload
      setStatusToOffline();
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [userProfile, updateBothStatuses, user]);






  useEffect(() => {
    const hangupAllCalls = () => {
      console.log('=== HANGING UP ALL CALLS ===');
  
      // Always pull fresh state (no stale closures)
      const { callSessions } = useCallCenterStore.getState();
  
      callSessions.forEach((session, sessionId) => {
        console.log(`Hanging up session: ${sessionId}, state: ${session.state}`);
  
        try {
          // Use the same logic as hangupCall function
          if (session instanceof Inviter) {
            if (session.state === SessionState.Initial || session.state === SessionState.Establishing) {
              console.log(`Cancelling outgoing call ${sessionId}...`);
              session.cancel().catch(error => {
                console.error(`Failed to cancel session ${sessionId}:`, error);
              });
            } else if (session.state === SessionState.Established) {
              console.log(`Sending BYE for established outgoing call ${sessionId}...`);
              session.bye().catch(error => {
                console.error(`Failed to send BYE for session ${sessionId}:`, error);
              });
            }
          } else if (session instanceof Invitation) {
            if (session.state === SessionState.Initial) {
              console.log(`Rejecting incoming call ${sessionId}...`);
              session.reject().catch(error => {
                console.error(`Failed to reject session ${sessionId}:`, error);
              });
            } else if (session.state === SessionState.Established) {
              console.log(`Sending BYE for established incoming call ${sessionId}...`);
              session.bye().catch(error => {
                console.error(`Failed to send BYE for session ${sessionId}:`, error);
              });
            }
          } else {
            // Generic session termination
            console.log(`Generic session termination for ${sessionId}...`);
            if (typeof session.bye === 'function') {
              session.bye().catch(error => {
                console.error(`Failed to send BYE for session ${sessionId}:`, error);
              });
            } else if (typeof session.cancel === 'function') {
              session.cancel().catch(error => {
                console.error(`Failed to cancel session ${sessionId}:`, error);
              });
            } else if (typeof session.reject === 'function') {
              session.reject().catch(error => {
                console.error(`Failed to reject session ${sessionId}:`, error);
              });
            }
          }
        } catch (error) {
          console.error(`Failed to hang up session ${sessionId}:`, error);
        }
      });
    };
  
    const handleBeforeUnload = () => {
      hangupAllCalls();
    };
  
    window.addEventListener('beforeunload', handleBeforeUnload);
  
    return () => {

      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
  



  // Hold all other calls
  const holdAllOtherCalls = async (activeSessionId) => {
    console.log(`=== HOLDING ALL CALLS EXCEPT ${activeSessionId} ===`);

    const holdPromises = [];

    callSessions.forEach(async (session, sessionId) => {
      // Get fresh state from store to avoid stale closures
      const currentState = useCallCenterStore.getState();
      const currentHoldStates = currentState.isOnHold;

      if (sessionId === activeSessionId || currentHoldStates.get(sessionId)) {
        return;
      }

      if (session.state !== SessionState.Established) {
        return;
      }

      console.log(`Auto-holding session: ${sessionId}`);

      try {
        const sessionDescriptionHandler = session.sessionDescriptionHandler;
        if (!sessionDescriptionHandler) {
          console.warn(`No session description handler for session ${sessionId}`);
          return;
        }

        // Disable audio tracks
        if (localStream) {
          const audioTracks = localStream.getAudioTracks();
          audioTracks.forEach(track => {
            track.enabled = false;
          });
        }

        if (sessionDescriptionHandler.peerConnection) {
          const senders = sessionDescriptionHandler.peerConnection.getSenders();
          for (const sender of senders) {
            if (sender.track && sender.track.kind === 'audio') {
              sender.track.enabled = false;
            }
          }
        }

        const sessionDescriptionHandlerOptions = {
          constraints: {
            audio: false,
            video: false
          },
          offerOptions: {
            offerToReceiveAudio: false,
            offerToReceiveVideo: false
          },
          iceGatheringTimeout: 500
        };

        const holdPromise = session.invite({ sessionDescriptionHandlerOptions }).then(() => {
          // Get fresh state again before updating to avoid race conditions
          const latestState = useCallCenterStore.getState();
          const newHoldStates = new Map(latestState.isOnHold);
          newHoldStates.set(sessionId, true);
          useCallCenterStore.setState({ isOnHold: newHoldStates });
          console.log(`Successfully put session ${sessionId} on hold`);
        }).catch(error => {
          console.error(`Failed to hold session ${sessionId}:`, error);
          const latestState = useCallCenterStore.getState();
          const newErrors = new Map(latestState.callErrors);
          newErrors.set(sessionId, `Auto-hold failed: ${error.message}`);
          useCallCenterStore.setState({ callErrors: newErrors });
        });

        holdPromises.push(holdPromise);
      } catch (error) {
        console.error(`Error auto-holding session ${sessionId}:`, error);
      }
    });

    await Promise.allSettled(holdPromises);
    console.log('Auto-hold operations completed');
  };

  // Make call active
  const makeCallActive = async (sessionId) => {
    console.log(`=== MAKING CALL ${sessionId} ACTIVE ===`);

    // First, hold all other calls
    await holdAllOtherCalls(sessionId);

    // Then unhold the specified call if it's currently on hold
    const session = callSessions.get(sessionId);
    const isOnHoldState = isOnHold.get(sessionId);

    if (!session || !isOnHoldState) {
      console.log(`Session ${sessionId} is already active or doesn't exist`);
      return;
    }

    try {
      if (session.state !== SessionState.Established) {
        console.warn('Session not established, cannot unhold');
        return;
      }

      const sessionDescriptionHandler = session.sessionDescriptionHandler;
      if (!sessionDescriptionHandler) {
        console.error('No session description handler available');
        return;
      }

      console.log(`Unholding session ${sessionId}...`);

      // Re-enable audio tracks
      if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = true;
        });
      }

      if (sessionDescriptionHandler.peerConnection) {
        const senders = sessionDescriptionHandler.peerConnection.getSenders();
        for (const sender of senders) {
          if (sender.track && sender.track.kind === 'audio') {
            sender.track.enabled = true;
          }
        }
      }

      const sessionDescriptionHandlerOptions = {
        constraints: {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            latency: 0.01,
            sampleRate: 48000,
            channelCount: 1
          },
          video: false
        },
        offerOptions: {
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        },
        iceGatheringTimeout: 500
      };

      await session.invite({ sessionDescriptionHandlerOptions });

      const newHoldStates = new Map(isOnHold);
      newHoldStates.set(sessionId, false);
      useCallCenterStore.setState({ isOnHold: newHoldStates });
      console.log(`Session ${sessionId} is now active`);

      // Setup audio streams
      setupAudioStreams(session, sessionId);
    } catch (error) {
      console.error(`Error making session ${sessionId} active:`, error);
      const newErrors = new Map(callErrors);
      newErrors.set(sessionId, `Failed to make active: ${error.message}`);
      useCallCenterStore.setState({ callErrors: newErrors });
    }
  };

  // Make call
  const makeCall = async ({ phoneNumber, customOutboundNumber = null }) => {
    if (!selectedExtension) {
      console.error('No extension selected for outbound calls.');
      toast.error('No extension available for making calls');
      return;
    }

    const userAgent = userAgents.get(selectedExtension.extension);
    const registrationStatus = registrationStatuses.get(selectedExtension.extension);

    if (!userAgent) {
      console.error(`User agent not found for extension ${selectedExtension.extension}`);
      toast.error('Extension not available');
      return;
    }

    // Check if UserAgent is connected (like old code)
    if (!userAgent.isConnected()) {
      console.error(`User agent for extension ${selectedExtension.extension} is not connected`);
      toast.error('Extension not connected. Please wait...');
      return;
    }

    if (registrationStatus !== 'registered') {
      console.error(`Extension ${selectedExtension.extension} is not ready for calls. Status: ${registrationStatus}.`);
      toast.error(`Extension ${selectedExtension.extension} is ${registrationStatus}. Please wait for registration.`);
      return;
    }

    const outboundNumberToUse = customOutboundNumber || selectedOutboundNumber;

    if (!outboundNumberToUse) {
      console.error('No outbound number selected for the call.');
      toast.error('Please select an outbound number from the dropdown');
      return;
    }

    try {
      console.log('Getting user media for outbound call...');
      const stream = await initializeUserMedia();
      if (!stream) {
        console.error('Failed to get user media stream');
        toast.error('Failed to access microphone');
        return;
      }

      const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
      if (!formattedPhoneNumber) {
        throw new Error('Invalid phone number format');
      }

      const targetUri = UserAgent.makeURI(`sip:${formattedPhoneNumber}@${CONNECTION_SETTINGS.DOMAIN}`);
      if (!targetUri) {
        throw new Error('Failed to create target URI');
      }

      // Get auth token from zustand store
      let currentToken = null;
      try {
        // Get token directly from zustand store
        const userStore = useUserStore.getState();
        currentToken = userStore?.token;

        if (!currentToken) {
          throw new Error('No authentication token found in store');
        }

        // Token should be a string, not JSON
        if (typeof currentToken !== 'string') {
          console.error('Token type:', typeof currentToken, 'Token value:', currentToken);
          throw new Error('Token must be a string, got: ' + typeof currentToken);
        }
      } catch (e) {
        console.error('Error getting auth token:', e);
        throw new Error('Failed to get authentication token: ' + e.message);
      }

      const decodedToken = jwtDecode(currentToken);


      console.log("This is the decodedToken", decodedToken)

      // Get audio elements directly to avoid findDOMNode
      const remoteAudioElement = remoteAudioRef?.current;
      const localAudioElement = localAudioRef?.current;

      const sessionDescriptionHandlerOptions = {
        constraints: {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            latency: 0.01,
            sampleRate: 48000,
            channelCount: 1
          },
          video: false
        },
        iceGatheringTimeout: 500,
        rtcConfiguration: {
          iceServers: ICE_SERVERS,
          iceGatheringPolicy: 'all',
          rtcpMuxPolicy: 'require',
          bundlePolicy: 'balanced'
        },
        // Pass audio elements directly to avoid findDOMNode
        ...(remoteAudioElement && { remoteAudioElement }),
        ...(localAudioElement && { localAudioElement })
      };

      const inviteOptions = {
        sessionDescriptionHandlerOptions,
        extraHeaders: [
          `X-CALLERID: ${selectedExtension.extension}`,
          `X-OUTBOUND-NUMBER: ${outboundNumberToUse}`,
          `X-OPERATOR-ID: ${userProfile?.user_id}`,
          `X-COMPANY-ID: ${decodedToken?.companyId}`,
          `From: <sip:${outboundNumberToUse}@${CONNECTION_SETTINGS.DOMAIN}>`
        ]
      };

      console.log(`Making call from extension ${selectedExtension.extension} to: ${targetUri}`);
      console.log(`Using outbound number: ${outboundNumberToUse}`);

      // Store previous call status
      if (typeof window !== 'undefined' && window.localStorage) {
        const currentCallStatus = localStorage.getItem('callStatus');
        const currentMessageStatus = localStorage.getItem('messageStatus');

        if (currentCallStatus && currentCallStatus !== 'occupied') {
          localStorage.setItem('previousCallStatus', currentCallStatus);
        }

        if (currentMessageStatus && currentMessageStatus !== 'occupied') {
          localStorage.setItem('previousMessageStatus', currentMessageStatus);
        }
      }

      // Ensure UserAgent is connected before making call (like old code)
      if (!userAgent.isConnected()) {
        throw new Error('UserAgent is not connected to server');
      }

      // Create inviter - peer connection will be created when invite() is called
      const inviter = new Inviter(userAgent, targetUri, inviteOptions);

      // Add session to state with initial status (returns sessionId)
      const sessionId = addSession({
        session: inviter,
        status: `Calling from ${outboundNumberToUse}...`,
        phoneNumber: formattedPhoneNumber
      });

      console.log('OUTGOING CALL: Session added to state with ID:', sessionId);

      // CRITICAL: Set up event handlers IMMEDIATELY before invite() (like old code)
      setupSessionEventHandlers(inviter, sessionId);

      // Show modal immediately
      setShowCallModal(true);

      // Hold all other calls
      console.log('Holding all other active calls...');
      await holdAllOtherCalls(sessionId);

      // Send the invitation
      console.log('Sending SIP INVITE immediately...');
      await inviter.invite();
      console.log('SIP INVITE sent successfully, session ID:', sessionId);

      // Setup audio streams after invite (for outgoing calls)
      // The session will be established later, but we can prepare
      setTimeout(() => {
        if (inviter.state === SessionState.Established) {
          setupAudioStreams(inviter, sessionId);
        }
      }, 500);

      return sessionId;
    } catch (error) {
      console.error('Error making call:', error);
      toast.error(`Failed to make call: ${error.message}`);

      // Restore previous status on error
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
          const previousCallStatus = localStorage.getItem('previousCallStatus');
          const previousMessageStatus = localStorage.getItem('previousMessageStatus');
          localStorage.setItem('callStatus', previousCallStatus || 'available');
          localStorage.setItem('messageStatus', previousMessageStatus || 'available');
        }
      }, 100);
    }
  };

  // Answer call
  const answerCall = async (sessionId) => {
    console.log(`=== ANSWERING CALL ${sessionId} ===`);

    const session = callSessions.get(sessionId);

    if (!session) {
      const errorMsg = 'No active call to answer.';
      console.error(errorMsg);
      updateSessionStatus({ sessionId, status: `Error: ${errorMsg}` });
      toast.error(errorMsg);
      return;
    }

    if (!(session instanceof Invitation)) {
      const errorMsg = 'Current session is not an incoming call.';
      console.error(errorMsg);
      updateSessionStatus({ sessionId, status: `Error: ${errorMsg}` });
      toast.error(errorMsg);
      return;
    }

    try {
      console.log('Preparing to answer incoming call...');

      let stream = localStream;
      if (!stream) {
        console.log('Getting user media for incoming call...');
        stream = await initializeUserMedia();
        if (!stream) {
          console.error('Failed to get user media for answering call');
          toast.error('Failed to access microphone');
          return;
        }
      }

      // Hold all other calls
      console.log('Holding all other active calls before answering...');
      await holdAllOtherCalls(sessionId);

      // Get audio elements directly to avoid findDOMNode
      const remoteAudioElement = remoteAudioRef?.current;
      const localAudioElement = localAudioRef?.current;

      const sessionDescriptionHandlerOptions = {
        constraints: {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            latency: 0.01,
            sampleRate: 48000,
            channelCount: 1
          },
          video: false
        },
        iceGatheringTimeout: 500,
        rtcConfiguration: {
          iceServers: ICE_SERVERS,
          iceGatheringPolicy: 'all',
          rtcpMuxPolicy: 'require',
          bundlePolicy: 'balanced'
        },
        // Pass audio elements directly to avoid findDOMNode
        ...(remoteAudioElement && { remoteAudioElement }),
        ...(localAudioElement && { localAudioElement })
      };

      const answerOptions = {
        sessionDescriptionHandlerOptions,
        extraHeaders: [
          `X-OPERATOR-ID: ${userProfile?.user_id}`,
        ]
      };

      console.log('Answering call...');
      await session.accept(answerOptions);
      updateSessionStatus({ sessionId, status: 'Call connected' });
      console.log('Call answered successfully');

      // CRITICAL: Setup audio streams immediately (like old code)
      setupAudioStreams(session, sessionId);

      // Backup audio setup with minimal delay (like old code)
      setTimeout(() => {
        setupAudioStreams(session, sessionId);
      }, 100);

      // Additional retry for audio setup (like old code pattern)
      setTimeout(() => {
        setupAudioStreams(session, sessionId);
      }, 500);
    } catch (error) {
      console.error('Error answering call:', error);
      const errorMsg = `Failed to answer call: ${error.message}`;
      updateSessionStatus({ sessionId, status: errorMsg });
      toast.error(errorMsg);

      // Restore previous status on error
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
          const previousCallStatus = localStorage.getItem('previousCallStatus');
          const previousMessageStatus = localStorage.getItem('previousMessageStatus');
          localStorage.setItem('callStatus', previousCallStatus || 'available');
          localStorage.setItem('messageStatus', previousMessageStatus || 'available');
        }
      }, 100);
    }
  };

  // Hangup call
  const hangupCall = async (sessionId) => {
    console.log(`=== HANGING UP CALL ${sessionId} ===`);

    const session = callSessions.get(sessionId);

    if (!session) {
      console.warn('No active session to hang up');
      return;
    }

    try {
      console.log('Terminating call...');

      if (session instanceof Inviter) {
        if (session.state === SessionState.Initial || session.state === SessionState.Establishing) {
          console.log('Cancelling outgoing call...');
          await session.cancel();
        } else if (session.state === SessionState.Established) {
          console.log('Sending BYE for established outgoing call...');
          await session.bye();
        }
      } else if (session instanceof Invitation) {
        if (session.state === SessionState.Initial) {
          console.log('Rejecting incoming call...');
          await session.reject();
        } else if (session.state === SessionState.Established) {
          console.log('Sending BYE for established incoming call...');
          await session.bye();
        }
      } else {
        console.log('Generic session termination...');
        if (typeof session.bye === 'function') {
          await session.bye();
        } else if (typeof session.cancel === 'function') {
          await session.cancel();
        } else if (typeof session.reject === 'function') {
          await session.reject();
        }
      }

      console.log('Call termination request sent');
    } catch (error) {
      console.error('Error hanging up:', error);
      const newErrors = new Map(callErrors);
      newErrors.set(sessionId, `Failed to hang up: ${error.message}`);
      useCallCenterStore.setState({ callErrors: newErrors });
      toast.error(`Failed to hang up: ${error.message}`);
    }

    // Cleanup session
    const intervalId = sessionIntervalsRef.current.get(sessionId);
    if (intervalId) {
      clearInterval(intervalId);
      sessionIntervalsRef.current.delete(sessionId);
    }

    removeSession(sessionId);

    // Restore status if no more active calls
    const activeIds = useCallCenterStore.getState().activeCallIds;
    if (activeIds.length < 1) {
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
          const previousCallStatus = localStorage.getItem('previousCallStatus');
          const previousMessageStatus = localStorage.getItem('previousMessageStatus');
          localStorage.setItem('callStatus', previousCallStatus || 'available');
          localStorage.setItem('messageStatus', previousMessageStatus || 'available');
        }
      }, 100);
    }
  };

  // Toggle mute
  const toggleMute = async (sessionId) => {
    console.log(`=== TOGGLING MUTE FOR SESSION ${sessionId} ===`);

    const session = callSessions.get(sessionId);
    const isMutedState = isMuted.get(sessionId) || false;

    if (!session) {
      console.warn('No active session to mute/unmute');
      return;
    }

    try {
      if (session.state !== SessionState.Established) {
        console.warn('Session not established, cannot mute/unmute');
        return;
      }

      const newMuteState = !isMutedState;
      let muteSuccess = false;

      // Control local stream tracks
      if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = !newMuteState;
        });
        muteSuccess = true;
      }

      // Control peer connection senders
      const sessionDescriptionHandler = session.sessionDescriptionHandler;
      if (sessionDescriptionHandler && sessionDescriptionHandler.peerConnection) {
        const senders = sessionDescriptionHandler.peerConnection.getSenders();
        for (const sender of senders) {
          if (sender.track && sender.track.kind === 'audio') {
            sender.track.enabled = !newMuteState;
            muteSuccess = true;
          }
        }
      }

      if (muteSuccess) {
        const newMutedStates = new Map(isMuted);
        newMutedStates.set(sessionId, newMuteState);
        useCallCenterStore.setState({ isMuted: newMutedStates });

        const newErrors = new Map(callErrors);
        newErrors.set(sessionId, null);
        useCallCenterStore.setState({ callErrors: newErrors });
      } else {
        console.error('No audio tracks available for mute/unmute');
        const newErrors = new Map(callErrors);
        newErrors.set(sessionId, 'Unable to mute/unmute: no audio tracks found');
        useCallCenterStore.setState({ callErrors: newErrors });
      }
    } catch (error) {
      console.error('Error toggling mute:', error);
      const newErrors = new Map(callErrors);
      newErrors.set(sessionId, `Failed to toggle mute: ${error.message}`);
      useCallCenterStore.setState({ callErrors: newErrors });
    }
  };

  // Toggle hold
  // const toggleHold = async (sessionId) => {
  //   console.log(`=== TOGGLING HOLD FOR SESSION ${sessionId} ===`);

  //   const session = callSessions.get(sessionId);
  //   const isOnHoldState = isOnHold.get(sessionId) || false;

  //   if (!session) {
  //     console.warn('No active session to hold/unhold');
  //     return;
  //   }

  //   try {
  //     if (session.state !== SessionState.Established) {
  //       console.warn('Session not established, cannot hold/unhold');
  //       return;
  //     }

  //     if (isOnHoldState) {
  //       console.log('Unholding call and making it active...');
  //       await makeCallActive(sessionId);
  //     } else {
  //       console.log('Putting call on hold...');

  //       const sessionDescriptionHandler = session.sessionDescriptionHandler;
  //       if (!sessionDescriptionHandler) {
  //         console.error('No session description handler available');
  //         const newErrors = new Map(callErrors);
  //         newErrors.set(sessionId, 'Session description handler not available');
  //         useCallCenterStore.setState({ callErrors: newErrors });
  //         return;
  //       }

  //       // Disable audio tracks
  //       if (localStream) {
  //         const audioTracks = localStream.getAudioTracks();
  //         audioTracks.forEach(track => {
  //           track.enabled = false;
  //         });
  //       }

  //       if (sessionDescriptionHandler.peerConnection) {
  //         const senders = sessionDescriptionHandler.peerConnection.getSenders();
  //         for (const sender of senders) {
  //           if (sender.track && sender.track.kind === 'audio') {
  //             sender.track.enabled = false;
  //           }
  //         }
  //       }

  //       const sessionDescriptionHandlerOptions = {
  //         constraints: {
  //           audio: false,
  //           video: false
  //         },
  //         offerOptions: {
  //           offerToReceiveAudio: false,
  //           offerToReceiveVideo: false
  //         },
  //         iceGatheringTimeout: 500
  //       };

  //       await session.invite({ sessionDescriptionHandlerOptions });

  //       const newHoldStates = new Map(isOnHold);
  //       newHoldStates.set(sessionId, true);
  //       useCallCenterStore.setState({ isOnHold: newHoldStates });
  //       console.log('Call put on hold using re-INVITE');
  //     }

  //     const newErrors = new Map(callErrors);
  //     newErrors.set(sessionId, null);
  //     useCallCenterStore.setState({ callErrors: newErrors });
  //   } catch (error) {
  //     console.error('Error toggling hold:', error);
  //     const newErrors = new Map(callErrors);
  //     newErrors.set(sessionId, `Failed to toggle hold: ${error.message}`);
  //     useCallCenterStore.setState({ callErrors: newErrors });
  //   }
  // };




  // Toggle hold
  const toggleHold = async (sessionId) => {
    console.log(`=== TOGGLING HOLD FOR SESSION ${sessionId} ===`);

    const session = callSessions.get(sessionId);
    const isOnHoldState = isOnHold.get(sessionId) || false;

    if (!session) {
      console.warn('No active session to hold/unhold');
      return;
    }

    try {
      if (session.state !== SessionState.Established) {
        console.warn('Session not established, cannot hold/unhold');
        return;
      }

      /**
       * ===============================
       * UNHOLD → make this call active
       * ===============================
       */
      if (isOnHoldState) {
        console.log('Unholding call and making it the only active call...');

        // This already unholds this call AND keeps others on hold
        await makeCallActive(sessionId);

        const newHoldStates = new Map(isOnHold);
        newHoldStates.set(sessionId, false);
        useCallCenterStore.setState({ isOnHold: newHoldStates });

        console.log('Call unheld and set as active');
      }

      /**
       * ===============================
       * HOLD → hold all other calls + this call
       * ===============================
       */
      else {
        console.log('Holding this call and all other active calls...');

        // 🔹 Hold all other active calls first (same behavior as makeCall)
        await holdAllOtherCalls(sessionId);

        const sessionDescriptionHandler = session.sessionDescriptionHandler;
        if (!sessionDescriptionHandler) {
          console.error('No session description handler available');
          const newErrors = new Map(callErrors);
          newErrors.set(sessionId, 'Session description handler not available');
          useCallCenterStore.setState({ callErrors: newErrors });
          return;
        }

        // Disable local audio tracks
        if (localStream) {
          localStream.getAudioTracks().forEach(track => {
            track.enabled = false;
          });
        }

        // Disable peer connection audio tracks
        if (sessionDescriptionHandler.peerConnection) {
          sessionDescriptionHandler.peerConnection
            .getSenders()
            .forEach(sender => {
              if (sender.track?.kind === 'audio') {
                sender.track.enabled = false;
              }
            });
        }

        // Send re-INVITE to place call on hold
        await session.invite({
          sessionDescriptionHandlerOptions: {
            constraints: {
              audio: false,
              video: false
            },
            offerOptions: {
              offerToReceiveAudio: false,
              offerToReceiveVideo: false
            },
            iceGatheringTimeout: 500
          }
        });

        const newHoldStates = new Map(isOnHold);
        newHoldStates.set(sessionId, true);
        useCallCenterStore.setState({ isOnHold: newHoldStates });

        console.log('Call put on hold using re-INVITE');
      }

      // Clear errors on success
      const newErrors = new Map(callErrors);
      newErrors.set(sessionId, null);
      useCallCenterStore.setState({ callErrors: newErrors });

    } catch (error) {
      console.error('Error toggling hold:', error);

      const newErrors = new Map(callErrors);
      newErrors.set(sessionId, `Failed to toggle hold: ${error.message}`);
      useCallCenterStore.setState({ callErrors: newErrors });
    }
  };



  // Transfer call
  // const transferCall = async ({ sessionId, targetExtension }) => {
  //   const session = callSessions.get(sessionId);

  //   if (!session) {
  //     console.warn('No active session to transfer');
  //     toast.error('No active call to transfer');
  //     return;
  //   }

  //   if (!targetExtension) {
  //     console.warn('No transfer target provided');
  //     toast.error('Please select a colleague to transfer to');
  //     return;
  //   }

  //   const normalizedExtension = String(targetExtension).trim();
  //   const targetUri = UserAgent.makeURI(`sip:${normalizedExtension}@${CONNECTION_SETTINGS.DOMAIN}`);

  //   if (!targetUri) {
  //     console.error('Failed to generate URI for transfer target');
  //     toast.error('Invalid transfer target');
  //     return;
  //   }

  //   if (session.state !== SessionState.Established && session.state !== SessionState.Establishing) {
  //     console.warn('Session not in transferable state');
  //     updateSessionStatus({ sessionId, status: 'Transfer unavailable (call not connected)' });
  //     toast.error('Call must be connected to transfer');
  //     return;
  //   }

  //   console.log(`Initiating transfer of session ${sessionId} to extension ${normalizedExtension}`);
  //   updateSessionStatus({ sessionId, status: `Transferring to ${normalizedExtension}...` });

  //   try {
  //     const referRequest = session.refer(targetUri, {
  //       requestDelegate: {
  //         onAccept: (options) => {
  //           console.log(`Transfer for ${sessionId} accepted`, options);
  //           updateSessionStatus({ sessionId, status: `Transfer completed (${normalizedExtension})` });
  //           toast.success(`Call transferred to ${normalizedExtension}`);

  //           // Cleanup after transfer
  //           setTimeout(() => {
  //             removeSession(sessionId);
  //           }, 150);
  //         },
  //         onReject: (options) => {
  //           const reason = options?.message?.reasonPhrase || options?.message?.statusCode || 'Rejected';
  //           console.error(`Transfer for ${sessionId} rejected:`, reason);
  //           updateSessionStatus({ sessionId, status: `Transfer rejected (${reason})` });
  //           toast.error(`Transfer rejected: ${reason}`);

  //           const newErrors = new Map(callErrors);
  //           newErrors.set(sessionId, `Transfer rejected: ${reason}`);
  //           useCallCenterStore.setState({ callErrors: newErrors });
  //         },
  //         onNotify: (notification) => {
  //           const notifyMessage = notification?.request?.message;
  //           const statusHeader = notifyMessage?.getHeader?.('Subscription-State') || '';
  //           const body = notifyMessage?.body || '';
  //           const statusFromHeaderMatch = statusHeader.match(/;reason=(\d{3})/i);
  //           const statusFromBodyMatch = body.match(/SIP\/2\.0\s+(\d{3})/i);
  //           const statusCode = statusFromHeaderMatch
  //             ? parseInt(statusFromHeaderMatch[1], 10)
  //             : statusFromBodyMatch
  //               ? parseInt(statusFromBodyMatch[1], 10)
  //               : notifyMessage?.statusCode || null;

  //           if (statusCode && statusCode >= 200 && statusCode < 300) {
  //             updateSessionStatus({ sessionId, status: `Transfer completed (${normalizedExtension})` });
  //             toast.success(`Call transferred to ${normalizedExtension}`);
  //             setTimeout(() => {
  //               removeSession(sessionId);
  //             }, 150);
  //           } else if (statusCode && statusCode >= 300) {
  //             updateSessionStatus({ sessionId, status: `Transfer failed (${statusCode})` });
  //             toast.error(`Transfer failed: ${statusCode}`);
  //             const newErrors = new Map(callErrors);
  //             newErrors.set(sessionId, `Transfer failed (${statusCode})`);
  //             useCallCenterStore.setState({ callErrors: newErrors });
  //           }
  //         }
  //       },
  //       requestOptions: {
  //         extraHeaders: [
  //           `X-TRANSFER-TARGET: ${normalizedExtension}`
  //         ]
  //       }
  //     });

  //     console.log('REFER request dispatched:', referRequest);
  //     return referRequest;
  //   } catch (error) {
  //     console.error('Error transferring call:', error);
  //     const newErrors = new Map(callErrors);
  //     newErrors.set(sessionId, `Transfer failed: ${error.message}`);
  //     useCallCenterStore.setState({ callErrors: newErrors });
  //     updateSessionStatus({ sessionId, status: `Transfer failed: ${error.message}` });
  //     toast.error(`Transfer failed: ${error.message}`);
  //     throw error;
  //   }
  // };



  const transferCall = async ({ sessionId, targetExtension }) => {
    const session = callSessions.get(sessionId);

    if (!session) {
      console.warn('No active session to transfer');
      toast.error('No active call to transfer');
      return;
    }

    if (!targetExtension) {
      console.warn('No transfer target provided');
      toast.error('Please select a colleague to transfer to');
      return;
    }

    const normalizedExtension = String(targetExtension).trim();
    const targetUri = UserAgent.makeURI(`sip:${normalizedExtension}@${CONNECTION_SETTINGS.DOMAIN}`);

    if (!targetUri) {
      console.error('Failed to generate URI for transfer target');
      toast.error('Invalid transfer target');
      return;
    }

    if (session.state !== SessionState.Established && session.state !== SessionState.Establishing) {
      console.warn('Session not in transferable state');
      updateSessionStatus({ sessionId, status: 'Transfer unavailable (call not connected)' });
      toast.error('Call must be connected to transfer');
      return;
    }

    console.log(`Initiating transfer of session ${sessionId} to extension ${normalizedExtension}`);
    updateSessionStatus({ sessionId, status: `Transferring to ${normalizedExtension}...` });

    // Helper to finalize transfer and cleanup
    const finalizeTransferAndCleanup = async (statusMessage, { markError = false } = {}) => {
      updateSessionStatus({ sessionId, status: statusMessage });

      if (markError) {
        const newErrors = new Map(callErrors);
        newErrors.set(sessionId, statusMessage);
        useCallCenterStore.setState({ callErrors: newErrors });
      }

      // Terminate the session properly like hangupCall
      try {
        if (session.state !== SessionState.Terminated) {
          if (typeof session.bye === 'function') {
            await session.bye();
          } else if (typeof session.cancel === 'function') {
            await session.cancel();
          } else if (typeof session.reject === 'function') {
            await session.reject();
          }
        }
      } catch (byeError) {
        console.warn('Failed to send BYE after transfer:', byeError);
      } finally {
        // Clear intervals if any
        const intervalId = sessionIntervalsRef.current.get(sessionId);
        if (intervalId) {
          clearInterval(intervalId);
          sessionIntervalsRef.current.delete(sessionId);
        }
        // Remove session from store
        removeSession(sessionId);
      }
    };

    try {
      const referRequest = session.refer(targetUri, {
        requestDelegate: {
          onAccept: async (options) => {
            console.log(`Transfer for ${sessionId} accepted`, options);
            await finalizeTransferAndCleanup(`Transfer completed (${normalizedExtension})`);
            toast.success(`Call transferred to ${normalizedExtension}`);
          },
          onReject: async (options) => {
            const reason = options?.message?.reasonPhrase || options?.message?.statusCode || 'Rejected';
            console.error(`Transfer for ${sessionId} rejected:`, reason);
            await finalizeTransferAndCleanup(`Transfer rejected (${reason})`, { markError: true });
            toast.error(`Transfer rejected: ${reason}`);
          },
          onNotify: async (notification) => {
            const notifyMessage = notification?.request?.message;
            const statusHeader = notifyMessage?.getHeader?.('Subscription-State') || '';
            const body = notifyMessage?.body || '';
            const statusFromHeaderMatch = statusHeader.match(/;reason=(\d{3})/i);
            const statusFromBodyMatch = body.match(/SIP\/2\.0\s+(\d{3})/i);
            const statusCode = statusFromHeaderMatch
              ? parseInt(statusFromHeaderMatch[1], 10)
              : statusFromBodyMatch
                ? parseInt(statusFromBodyMatch[1], 10)
                : notifyMessage?.statusCode || null;

            if (statusCode && statusCode >= 200 && statusCode < 300) {
              await finalizeTransferAndCleanup(`Transfer completed (${normalizedExtension})`);
              toast.success(`Call transferred to ${normalizedExtension}`);
            } else if (statusCode && statusCode >= 300) {
              await finalizeTransferAndCleanup(`Transfer failed (${statusCode})`, { markError: true });
              toast.error(`Transfer failed: ${statusCode}`);
            }
          }
        },
        requestOptions: {
          extraHeaders: [`X-TRANSFER-TARGET: ${normalizedExtension}`]
        }
      });

      console.log('REFER request dispatched:', referRequest);
      return referRequest;
    } catch (error) {
      console.error('Error transferring call:', error);
      const newErrors = new Map(callErrors);
      newErrors.set(sessionId, `Transfer failed: ${error.message}`);
      useCallCenterStore.setState({ callErrors: newErrors });
      updateSessionStatus({ sessionId, status: `Transfer failed: ${error.message}` });
      toast.error(`Transfer failed: ${error.message}`);
      throw error;
    }
  };

  // Set action methods in store
  useEffect(() => {
    setActionMethods({
      makeCall,
      answerCall,
      hangupCall,
      toggleMute,
      toggleHold,
      transferCall,
      holdAllOtherCalls,
      makeCallActive,
      setupAudioStreams,
      initializeUserMedia,
      formatPhoneNumber,
      formatDuration,
    });
  }, []);

  // Cleanup only volatile browser resources; keep user agents alive across route changes.
  // Full SIP teardown happens explicitly during logout.
  const userAgentsRef = useRef(userAgents);
  useEffect(() => {
    userAgentsRef.current = userAgents;
  }, [userAgents]);

  useEffect(() => {
    return () => {
      console.log('CallCenter hook unmounting...');

      // Clear all duration intervals
      sessionIntervalsRef.current.forEach((intervalId) => {
        clearInterval(intervalId);
      });
      sessionIntervalsRef.current.clear();

      // Clean up pre-initialized user media
      if (userMediaStreamRef.current) {
        userMediaStreamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        userMediaStreamRef.current = null;
      }

      // Don't stop user agents on unmount - they should persist across navigation
      // Only cleanup intervals and media streams
      // User agents will be cleaned up when user logs out or app closes
      console.log('CallCenter hook cleanup: preserving user agents for navigation');
    };
  }, []); // Empty dependency array - only run on unmount

  return {
    // Extension data
    extensions,
    userAgents,
    registrationStatuses,
    selectedExtension,
    setSelectedExtension,

    // Outbound number selection
    selectedOutboundNumber,
    setSelectedOutboundNumber: useCallCenterStore((state) => state.setSelectedOutboundNumber),
    availableOutboundNumbers,

    // Overall status
    status: useCallCenterStore((state) => state.getOverallStatus()),

    // Multiple call state
    sessions: callSessions,
    callStatuses,
    phoneNumbers,
    callDurations,
    mutedStates: isMuted,
    holdStates: isOnHold,
    callErrors,
    incomingCallExtensions,
    activeCallIds,
    showCallModal,

    // Call actions
    handleMakeCall: makeCall,
    handleAnswerCall: answerCall,
    handleHangup: hangupCall,
    handleToggleMute: toggleMute,
    handleHoldCall: toggleHold,
    handleTransferCall: transferCall,
    handleMakeCallActive: makeCallActive,
    handleHoldAllOtherCalls: holdAllOtherCalls,

    // Audio refs
    remoteAudioRef,
    localAudioRef,

    // Utilities
    formatDuration,
    initializeAllUserAgents,
  };
};