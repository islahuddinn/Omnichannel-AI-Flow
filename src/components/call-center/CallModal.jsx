// src/components/call-center/CallModal.jsx
// Call center: draggable modal(s) per active call with answer/decline, mute, hold, transfer, and duration display.

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  Phone,
  PhoneOff,
  PhoneIncoming,
  Pause,
  Play,
  VolumeX,
  Minimize2,
  Maximize2,
  PhoneCall,
} from 'lucide-react';
import Image from 'next/image';
import Draggable from 'react-draggable';
import { useCallCenterStore } from '@/store/useCallCenterStore';
import { useCallCenter } from '@/hooks/useCallCenter';
import { useCallStatusSocket } from '@/hooks/useCallStatusSocket';
import { useUsersWithCallFeature } from '@/hooks/useUsersWithCallFeature';
import { useContactByPhone } from '@/hooks/useContactByPhone';
import { Invitation, Inviter, SessionState } from 'sip.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { detectCallDirection, formatCallDuration } from '@/utils/callCenter/callUtils';

// Component for displaying call options
const CallOptions = ({
  sessionId,
  call,
  onHold,
  onMute,
  onHangup,
  isAnswerable,
  onAnswer,
  isMuted,
  isOnHold,
  onMakeActive,
  callStatus
}) => {
  return (
    <div className="flex flex-wrap justify-center gap-3 w-full mt-4">
      {isAnswerable ? (
        <>
          <button
            onClick={() => onAnswer(sessionId)}
            className="flex items-center justify-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors duration-200 shadow-md font-medium"
            disabled={!call}
          >
            <PhoneIncoming size={18} />
            <span>Answer</span>
          </button>
          <button
            onClick={() => onHangup(sessionId)}
            className="flex items-center justify-center space-x-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors duration-200 shadow-md font-medium"
            disabled={!call}
          >
            <PhoneOff size={18} />
            <span>Decline</span>
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => onMute(sessionId)}
            disabled={!call || callStatus !== "Call connected"}
            className={`flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 transition-colors duration-200 shadow-md font-medium text-sm text-white
              ${!call || callStatus !== "Call connected"
                ? "bg-gray-400 cursor-not-allowed"
                : isMuted
                  ? "bg-yellow-600 hover:bg-yellow-700"
                  : "bg-gray-600 hover:bg-gray-700"
              }`}
          >
            {isMuted ? <VolumeX size={16} /> : <Mic size={16} />}
            <span>{isMuted ? "Unmute" : "Mute"}</span>
          </button>

          <button
            onClick={() => onHold(sessionId)}
            disabled={!call || callStatus !== "Call connected"}
            className={`flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 transition-colors duration-200 shadow-md font-medium text-sm text-white
              ${!call || callStatus !== "Call connected"
                ? "bg-gray-400 cursor-not-allowed"
                : isOnHold
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-600 hover:bg-gray-700"
              }`}
          >
            {isOnHold ? (
              <>
                <Play size={16} />
                <span>Resume</span>
              </>
            ) : (
              <>
                <Pause size={16} />
                <span>Hold</span>
              </>
            )}
          </button>

          <button
            onClick={() => onHangup(sessionId)}
            className="flex items-center justify-center space-x-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors duration-200 shadow-md font-medium text-sm"
            disabled={!call}
          >
            <PhoneOff size={18} />
            <span>End Call</span>
          </button>
        </>
      )}
    </div>
  );
};

// Individual draggable call window for one active SIP session.
const IndividualCallModal = ({
  sessionId,
  index,
  totalCalls,
  transferTargets = [],
  transferListState = { isLoading: false, hasError: false, error: null }
}) => {
  // Get state from store
  const callSessions = useCallCenterStore((state) => state.callSessions);
  const callStatuses = useCallCenterStore((state) => state.callStatuses);
  const phoneNumbers = useCallCenterStore((state) => state.phoneNumbers);
  const callDurations = useCallCenterStore((state) => state.callDurations);
  const isMuted = useCallCenterStore((state) => state.isMuted);

  // Select per-session hold flag to avoid unrelated modal re-renders.
  const isOnHoldState = useCallCenterStore((state) => state.isOnHold.get(sessionId) || false);

  const selectedExtension = useCallCenterStore((state) => state.selectedExtension);
  const selectedOutboundNumber = useCallCenterStore((state) => state.selectedOutboundNumber);
  const registrationStatuses = useCallCenterStore((state) => state.registrationStatuses);
  const incomingCallExtensions = useCallCenterStore((state) => state.incomingCallExtensions);

  // Get actions from hook
  const { handleAnswerCall, handleHangup, handleToggleMute, handleHoldCall, handleMakeCallActive, handleTransferCall } = useCallCenter();

  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedTransferExtension, setSelectedTransferExtension] = useState('');
  const [transferFeedback, setTransferFeedback] = useState(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [search, setSearch] = useState("");
  const [isSelectOpen, setIsSelectOpen] = useState(true);

  // Ref for draggable element (React 18+ compatibility)
  const draggableRef = useRef(null);

  // Get session data
  const session = callSessions.get(sessionId);
  const callStatus = callStatuses.get(sessionId) || '';
  const phoneNumber = phoneNumbers.get(sessionId) || '';
  const callDuration = callDurations.get(sessionId) || 0;
  const isMutedState = isMuted.get(sessionId) || false;
  const incomingCallExtension = incomingCallExtensions.get(sessionId);

  // Debug: Log status and session changes
  useEffect(() => {
    console.log(`[CallModal ${sessionId}] Render - Status:`, callStatus, 'Session exists:', !!session, 'Duration:', callDuration);
  }, [callStatus, sessionId, session, callDuration]);

  const canTransfer = session?.state === SessionState.Established;

  const availableTransferTargets = useMemo(() => {
    if (!transferTargets?.length) {
      return [];
    }
    const selectedExtValue = selectedExtension?.extension
      ? String(selectedExtension.extension).trim()
      : null;
    return transferTargets.filter(target => target.extension !== selectedExtValue);
  }, [transferTargets, selectedExtension]);

  // Filter targets based on search input
  const filteredTargets = availableTransferTargets.filter(target =>
    (target.name || target.userId)
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  // Format duration function
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Determine call direction and answerable state
  const isIncomingCall = session instanceof Invitation;
  const isOutgoingCall = session instanceof Inviter;

  const isAnswerableState = isIncomingCall &&
    session &&
    (session.state === SessionState.Initial || session.state === SessionState.Establishing) &&
    !session.isCanceled &&
    (callStatus?.toLowerCase().includes("incoming") ||
      callStatus?.toLowerCase().includes("ringing") ||
      callStatus?.toLowerCase().includes("from"));

  // Get display phone number based on call direction
  const getDisplayPhoneNumber = () => {
    if (isIncomingCall && session?.remoteIdentity?.uri?.user) {
      return session.remoteIdentity.uri.user;
    }
    if (isOutgoingCall && phoneNumber) {
      return phoneNumber;
    }
    return phoneNumber || "Unknown";
  };

  const displayPhoneNumber = getDisplayPhoneNumber();

  // Fetch contact by phone number
  const { data: contact } = useContactByPhone(displayPhoneNumber, {
    enabled: !!displayPhoneNumber && displayPhoneNumber !== 'Unknown',
  });

  // Get contact name if available
  const contactName = contact?.name || contact?.displayName || contact?.firstName 
    ? [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || contact?.name || contact?.displayName
    : null;

  // Determine call direction text
  const getCallDirection = () => {
    if (isIncomingCall) return "incoming";
    if (isOutgoingCall) return "outgoing";
    return "unknown";
  };

  const callDirection = getCallDirection();

  // Create a simple call object for compatibility
  const currentCall = session ? {
    session: session,
    isMuted: isMutedState,
    isOnHold: isOnHoldState,
    direction: callDirection
  } : null;

  // Icon logic from CallStatusTabs
  const getCallIcon = (status, direction, duration = 0, isCompleted = false) => {
    const normalizedDirection = String(direction || '').toLowerCase().trim();
    const statusLower = String(status || '').toLowerCase();

    const isIncoming = normalizedDirection === "incoming" ||
      normalizedDirection === "in" ||
      statusLower.includes('incoming') ||
      status === 'Missed Call';

    const iconBasePath = "/images/icons/callIcons";

    if (isCompleted) {
      if (status === 'Incoming Completed') {
        return `${iconBasePath}/IncommingCompleted.png`;
      } else if (status === 'Outgoing Completed') {
        return `${iconBasePath}/OutgoingCompleted.png`;
      } else if (status === 'Missed Call') {
        return `${iconBasePath}/IncommingNotAnswered.png`;
      } else if (status === 'Not Answered') {
        return `${iconBasePath}/OutgoingNotAnswered.png`;
      } else {
        return isIncoming ?
          `${iconBasePath}/IncommingNotAnswered.png` :
          `${iconBasePath}/OutgoingNotAnswered.png`;
      }
    } else {
      const isConnected = status === "Call connected" || status === "Call accepted" || status === "On Hold";
      const isConnecting = status === "Ringing..." || status === "Trying..." || status === "Connecting..." ||
        (typeof status === "string" && (status.startsWith("Incoming call") || status.startsWith("Calling")));

      if (isConnected) {
        return isIncoming ?
          `${iconBasePath}/IncommingConnected.png` :
          `${iconBasePath}/OutgoingConnected.png`;
      } else if (isConnecting) {
        return isIncoming ?
          `${iconBasePath}/IncommingConnecting.png` :
          `${iconBasePath}/OutgoingConnecting.png`;
      }
    }

    const fallbackPath = isIncoming ?
      `${iconBasePath}/IncommingConnecting.png` :
      `${iconBasePath}/OutgoingConnecting.png`;
    return fallbackPath;
  };

  // Updated getStatusIcon function
  const getStatusIcon = () => {
    const iconPath = getCallIcon(callStatus, callDirection, callDuration, false);
    const size = isMinimized ? 28 : 56;

    let animationClasses = "";
    if (callStatus?.includes("Ringing") || (callStatus?.includes("Incoming") && isAnswerableState)) {
      animationClasses = "animate-bounce";
    } else if (callStatus?.includes("Connecting") || callStatus?.includes("Calling")) {
      animationClasses = "animate-pulse";
    }

    return (
      <div className={`flex items-center justify-center ${animationClasses}`}>
        <Image
          src={iconPath}
          width={size}
          height={size}
          className="object-contain"
          alt={`${callDirection} call ${callStatus.toLowerCase()}`}
          priority={true}
          unoptimized={true}
          onError={(e) => {
            console.warn(`Modal: Failed to load icon: ${iconPath}`);
            e.target.src = "/images/icons/callIcons/OutgoingConnecting.png";
          }}
        />
      </div>
    );
  };

  const getStatusColor = () => {
    if (callStatus?.includes("failed") || callStatus?.includes("Error")) return "text-red-600";
    if (isOnHoldState) return "text-yellow-600";
    if (callStatus?.includes("connected") || callStatus?.includes("Call connected")) return "text-green-600";
    if (callStatus?.includes("Ringing")) return "text-yellow-600";
    if (callStatus?.includes("Connecting") || callStatus?.includes("Calling")) return "text-blue-600";
    return "text-gray-600";
  };

  const getBackgroundColor = () => {
    if (callStatus?.includes("connected") || callStatus?.includes("Call connected")) {
      if (isOnHoldState) return "bg-yellow-50 border-yellow-200";
      return "bg-green-50 border-green-200";
    }
    if (callStatus?.includes("Ringing") || callStatus?.includes("Incoming") || isAnswerableState) return "bg-blue-50 border-blue-200";
    if (callStatus?.includes("Connecting") || callStatus?.includes("Calling")) return "bg-indigo-50 border-indigo-200";
    if (callStatus?.includes("failed") || callStatus?.includes("Error")) return "bg-red-50 border-red-200";
    return "bg-blue-50 border-blue-200";
  };

  // Action handlers
  const handleAnswer = () => {
    console.log(`Answer button clicked for call ${sessionId}`);
    handleAnswerCall(sessionId);
  };

  const onHangupClick = () => {
    console.log(`Hangup button clicked for call ${sessionId}`);
    handleHangup(sessionId);
  };

  const onToggleMuteClick = () => {
    console.log(`Mute toggle clicked for call ${sessionId}`);
    handleToggleMute(sessionId);
  };

  const handleHold = () => {
    console.log(`Hold toggle clicked for call ${sessionId}`);
    handleHoldCall(sessionId);
  };

  const handleMakeActive = () => {
    console.log(`Make active clicked for call ${sessionId}`);
    handleMakeCallActive(sessionId);
  };

  const handleTransferSubmission = async () => {
    if (!selectedTransferExtension) {
      setTransferFeedback({
        type: 'error',
        message: 'Please select a colleague to transfer this call to.'
      });
      return;
    }

    try {
      setIsTransferring(true);
      setTransferFeedback(null);

      await handleTransferCall({
        sessionId,
        targetExtension: selectedTransferExtension
      });

      setTransferFeedback({
        type: 'success',
        message: `Transfer initiated to extension ${selectedTransferExtension}.`
      });
    } catch (error) {
      setTransferFeedback({
        type: 'error',
        message: error?.message || 'Transfer failed. Please try again.'
      });
    } finally {
      setIsTransferring(false);
    }
  };

  // Stagger modal positions so multiple active calls remain visible.
  const getModalPosition = () => {
    if (isMinimized) {
      const bottomOffset = 20 + (index * 70);
      const rightOffset = 20;
      return {
        x: typeof window !== 'undefined' ? window.innerWidth - 320 - rightOffset : 0,
        y: typeof window !== 'undefined' ? window.innerHeight - bottomOffset - 60 : 0
      };
    } else {
      const offset = index * 30;
      return { x: 200 + offset, y: 200 + offset };
    }
  };

  if (!session) {
    return null;
  }

  return (
    <Draggable
      nodeRef={draggableRef}
      handle=".drag-handle"
      defaultPosition={getModalPosition()}
      bounds="body"
      enableUserSelectHack={false}
      scale={1}
      onStart={() => {
        if (typeof document !== 'undefined') {
          document.body.style.userSelect = 'none';
        }
      }}
      onStop={() => {
        if (typeof document !== 'undefined') {
          document.body.style.userSelect = '';
        }
      }}
    >
      <div
        ref={draggableRef}
        className={`fixed z-[10000] bg-white rounded-xl shadow-xl border-2 ${isMinimized ? 'w-80 h-16' : 'w-96 min-h-[280px]'
          } ${getBackgroundColor()}`}
        style={{
          willChange: 'transform',
          transform: 'translate3d(0, 0, 0)',
        }}
      >
        {/* Header */}
        <div className="drag-handle cursor-move bg-gray-100 p-3 rounded-t-xl flex items-center justify-between border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center">
              {getStatusIcon()}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-800 select-none">
                {isIncomingCall
                  ? "Incoming Call"
                  : isOutgoingCall
                    ? "Outgoing Call"
                    : "Active Call"}
                {isOnHoldState && " (On Hold)"}
              </span>
              {totalCalls > 1 && (
                <span className="text-xs text-gray-500 select-none">
                  {index + 1} of {totalCalls}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors duration-200"
          >
            {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
        </div>

        {/* Content - hide when minimized */}
        {!isMinimized && (
          <div className="p-6 space-y-4">
            {/* Call Status Icon */}
            <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center shadow-md border-4 border-white ${getBackgroundColor()}`}>
              {getStatusIcon()}
            </div>

            {/* Call Information */}
            <div className="text-center space-y-3 w-full">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                {contactName ? (
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-gray-800">
                      {contactName}
                    </p>
                    <p className="text-sm text-gray-600">
                      {isIncomingCall
                        ? `From: ${displayPhoneNumber || "Unknown"}`
                        : `To: ${displayPhoneNumber || "Unknown"}`}
                    </p>
                  </div>
                ) : (
                  <p className="text-lg font-semibold text-gray-800 mb-2">
                    {isIncomingCall
                      ? `From: ${displayPhoneNumber || "Unknown"}`
                      : `To: ${displayPhoneNumber || "Unknown"}`}
                  </p>
                )}

                {/* Extension and Outbound Number Info */}
                <div className="space-y-2">
                  {selectedOutboundNumber && !isIncomingCall && (
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
                      <Phone size={14} />
                      <span className="font-medium">Caller ID: {selectedOutboundNumber}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className={`${getStatusColor()} font-semibold text-base`}>
                  {isOnHoldState ? "On Hold" : (callStatus || "Connecting...")}
                </p>

                {(callStatus?.includes("connected") || callStatus?.includes("Call connected") || callStatus?.includes("Call accepted")) && callDuration > 0 && (
                  <div className="">
                    <p className="text-lg font-semibold text-indigo-800">
                      {formatDuration(callDuration)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Call Controls */}
            <CallOptions
              sessionId={sessionId}
              call={currentCall}
              onHold={handleHold}
              onMute={onToggleMuteClick}
              onHangup={onHangupClick}
              isAnswerable={isAnswerableState}
              onAnswer={handleAnswer}
              isMuted={isMutedState}
              isOnHold={isOnHoldState}
              onMakeActive={handleMakeActive}
              callStatus={callStatus}
            />

            {/* Transfer Controls */}
            {canTransfer && (
              <div className="mt-6 border-t border-gray-200 pt-4 text-left">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Transfer Call</p>
                    <p className="text-xs text-gray-500">Send this call to another Agent.</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {transferListState?.isLoading ? (
                    <p className="text-sm text-gray-500">Loading colleagues...</p>
                  ) : transferListState?.hasError ? (
                    <p className="text-sm text-red-600">
                      {transferListState.error?.message || 'Unable to load colleagues list.'}
                    </p>
                  ) : availableTransferTargets.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No eligible colleagues with phone extensions found.
                    </p>
                  ) : (
                    <>
                      <Select
                        value={selectedTransferExtension}
                        open={isSelectOpen}
                        onOpenChange={setIsSelectOpen}
                        onValueChange={(value) => {
                          setSelectedTransferExtension(value);
                          setTransferFeedback(null);
                        }}
                      >
                        <SelectTrigger className="w-full h-11 rounded-lg border bg-white px-3 text-left shadow-sm hover:bg-gray-50">
                          {selectedTransferExtension ? (
                            (() => {
                              const target = availableTransferTargets.find(
                                (t) => t.extension === selectedTransferExtension
                              );
                              if (!target) return <SelectValue placeholder="Select colleague" />;

                              const departmentsText =
                                target.departments?.length > 0
                                  ? target.departments.map((d) => d.name).join(", ")
                                  : "—";

                              return (
                                <div className="flex items-center gap-3 text-sm w-full">
                                  <span className="font-semibold text-gray-900 truncate max-w-[120px]">
                                    {target.name || target.userId}
                                  </span>

                                  <span className="text-gray-600 truncate max-w-[180px]">
                                    <span className="font-medium text-gray-700">Dept:</span>{" "}
                                    {departmentsText}
                                  </span>

                                  <span className="text-gray-600 shrink-0">
                                    <span className="font-medium text-gray-700">Status:</span>{" "}
                                    {target.status || "unknown"}
                                  </span>
                                </div>
                              );
                            })()
                          ) : (
                            <SelectValue placeholder="Select colleague" />
                          )}
                        </SelectTrigger>

                        <SelectContent
                          position="popper"
                          className="z-[10050] rounded-lg border shadow-md bg-white"
                        >

                          <Command>
                            <CommandInput
                              placeholder="Search colleague..."
                              className="px-3 py-2"
                              value={search}
                              onValueChange={setSearch}
                            />

                            <CommandList>
                              {filteredTargets.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-gray-500">
                                  No colleagues found
                                </div>
                              ) : (
                                filteredTargets.map((target) => {
                                  const departmentsText =
                                    target.departments?.length > 0
                                      ? target.departments.map((d) => d.name).join(", ")
                                      : "—";

                                  return (
                                    <CommandItem
                                      key={target.userId}
                                      value={target.name || target.userId}
                                      onSelect={() => {
                                        setSelectedTransferExtension(target.extension);
                                        setTransferFeedback(null);
                                        setIsSelectOpen(false);
                                        setSearch("");
                                      }}
                                      className="cursor-pointer px-3 py-2 aria-selected:bg-gray-100"
                                    >
                                      <div className="flex items-center gap-3 text-sm w-full">
                                        <span className="font-semibold text-gray-900 truncate max-w-[120px]">
                                          {target.name || target.userId}
                                        </span>

                                        <span className="text-gray-600 truncate max-w-[180px]">
                                          <span className="font-medium text-gray-700">Dept:</span>{" "}
                                          {departmentsText}
                                        </span>

                                        <span className="text-gray-600 shrink-0">
                                          <span className="font-medium text-gray-700">Status:</span>{" "}
                                          {target.status || "unknown"}
                                        </span>
                                      </div>
                                    </CommandItem>
                                  );
                                })
                              )}
                            </CommandList>
                          </Command>
                        </SelectContent>
                      </Select>

                      <button
                        onClick={handleTransferSubmission}
                        disabled={!selectedTransferExtension || isTransferring}
                        className={`w-full px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${(!selectedTransferExtension || isTransferring)
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                      >
                        {isTransferring ? 'Transferring...' : 'Confirm Transfer'}
                      </button>
                    </>
                  )}

                  {transferFeedback && (
                    <p
                      className={`text-sm ${transferFeedback.type === 'error'
                        ? 'text-red-600'
                        : 'text-green-600'
                        }`}
                    >
                      {transferFeedback.message}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Minimized view content */}
        {isMinimized && (
          <div className="flex items-center justify-between px-4 py-3 h-16 bg-white rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6">
                {getStatusIcon()}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-800 truncate max-w-[120px]">
                  {contactName || displayPhoneNumber} {isOnHoldState && "(Hold)"}
                </span>
                {(callStatus?.includes("connected") || callStatus?.includes("Call connected")) && (
                  <span className="text-xs font-medium text-indigo-600">
                    {formatDuration(callDuration)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {isAnswerableState ? (
                <>
                  <button
                    onClick={handleAnswer}
                    className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 shadow-md"
                  >
                    <PhoneIncoming size={18} />
                  </button>
                  <button
                    onClick={onHangupClick}
                    className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 shadow-md"
                  >
                    <PhoneOff size={18} />
                  </button>
                </>
              ) : (
                <>
                  {isOnHoldState && (
                    <button
                      onClick={handleMakeActive}
                      className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 shadow-md"
                    >
                      <PhoneCall size={16} />
                    </button>
                  )}
                  <button
                    onClick={onToggleMuteClick}
                    className={`p-2 text-white rounded-lg transition-colors duration-200 shadow-md ${isMutedState ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'
                      }`}
                  >
                    {isMutedState ? <VolumeX size={16} /> : <Mic size={16} />}
                  </button>
                  <button
                    onClick={onHangupClick}
                    className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 shadow-md"
                  >
                    <PhoneOff size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Draggable>
  );
};

// Renders one modal per active call when call-center UI is enabled.
const MultipleCallModals = () => {
  const activeCallIds = useCallCenterStore((state) => state.activeCallIds);
  const showCallModal = useCallCenterStore((state) => state.showCallModal);
  const remoteAudioRef = useCallCenterStore((state) => state.remoteAudioRef);
  const localAudioRef = useCallCenterStore((state) => state.localAudioRef);

  const { data: employeesData } = useUsersWithCallFeature();
  const { localTransferTargets } = useCallStatusSocket();

  const transferListState = useMemo(() => ({
    isLoading: !employeesData,
    hasError: false,
    error: null
  }), [employeesData]);

  if (!showCallModal || activeCallIds.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {activeCallIds.map((sessionId, index) => (
        <div key={sessionId} className="pointer-events-auto">
          <IndividualCallModal
            sessionId={sessionId}
            index={index}
            totalCalls={activeCallIds.length}
            transferTargets={localTransferTargets}
            transferListState={transferListState}
          />
        </div>
      ))}
    </div>
  );
};

export default MultipleCallModals;

