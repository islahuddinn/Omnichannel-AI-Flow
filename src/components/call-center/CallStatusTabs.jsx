"use client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PhoneFormatter from "@/utils/PhoneFormatter";
import {
  detectCallDirection,
  formatCallDuration,
  determineCallStatus,
  normalizePhone,
} from "@/utils/callCenter/callUtils";
import Image from "next/image";
import React, { useEffect, useRef } from "react";
import { useContactByPhone } from "@/hooks/useContactByPhone";
import { X, Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCallCenterStore } from "@/store/useCallCenterStore";
import { useCallStatusTabsStore } from "@/store/useCallStatusTabsStore";
import useChatStore from "@/store/useChatStore";
import apiClient from "@/lib/api/client";
import {
  fetchAllCallStatus,
  createCallStatus,
  deleteCallStatus,
} from "@/api-services/call-status-tabs/callTabs";

// Component to display contact name or phone number
const ContactNameDisplay = ({ phoneNumber }) => {
  const { data: contact } = useContactByPhone(phoneNumber, {
    enabled: !!phoneNumber && phoneNumber !== 'Unknown',
  });

  const contactName = contact?.name || contact?.displayName || contact?.firstName 
    ? [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || contact?.name || contact?.displayName
    : null;

  const displayText = contactName || phoneNumber || "Unknown";
  const truncatedText = displayText.length > 7
    ? displayText.slice(0, 7) + "..."
    : displayText;

  return (
    <>
      <div className="text-xs font-semibold text-slate-800 dark:text-foreground truncate">
        {truncatedText}
      </div>
      {contactName && (
        <div className="text-[10px] text-slate-500 dark:text-muted-foreground truncate">
          {phoneNumber}
        </div>
      )}
    </>
  );
};

// Component for tooltip content with contact info
const ContactTooltipContent = ({ phoneNumber, status, duration, time, direction, isOnHold }) => {
  const { data: contact } = useContactByPhone(phoneNumber, {
    enabled: !!phoneNumber && phoneNumber !== 'Unknown',
  });

  const contactName = contact?.name || contact?.displayName || contact?.firstName 
    ? [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || contact?.name || contact?.displayName
    : null;

  return (
    <div className="flex flex-col space-y-1.5 text-sm">
      {contactName && (
        <div className="text-sm font-semibold text-white">
          {contactName}
        </div>
      )}
      <PhoneFormatter phoneNumber={phoneNumber} />
      <div className="text-xs text-slate-300 dark:text-muted-foreground">
        {status}{" "}
        {duration > 0 && `(${formatCallDuration(duration)})`}
      </div>
      {time && (
        <div className="text-xs text-slate-400 dark:text-muted-foreground">
          {time}
        </div>
      )}
      {isOnHold && (
        <div className="text-xs font-semibold text-amber-400">
          On Hold
        </div>
      )}
      <div className="text-xs text-slate-400 dark:text-muted-foreground">
        Direction: {direction}
      </div>
    </div>
  );
};

function CallStatusTabs() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Get data from call center store (active calls)
  const callSessions = useCallCenterStore((state) => state.callSessions);
  const callStatuses = useCallCenterStore((state) => state.callStatuses);
  const phoneNumbers = useCallCenterStore((state) => state.phoneNumbers);
  const callDurations = useCallCenterStore((state) => state.callDurations);
  const isOnHold = useCallCenterStore((state) => state.isOnHold);
  const activeCallIds = useCallCenterStore((state) => state.activeCallIds);
  const setShowCallModal = useCallCenterStore(
    (state) => state.setShowCallModal
  );

  // Get data from call status tabs store (completed calls and selection)
  const completedCalls = useCallStatusTabsStore(
    (state) => state.completedCalls
  );
  const completedCallPhoneNumbers = useCallStatusTabsStore(
    (state) => state.completedCallPhoneNumbers
  );
  const completedCallDirections = useCallStatusTabsStore(
    (state) => state.completedCallDirections
  );
  const selectedActiveCallIndex = useCallStatusTabsStore(
    (state) => state.selectedActiveCallIndex
  );
  const setSelectedActiveCallIndex = useCallStatusTabsStore(
    (state) => state.setSelectedActiveCallIndex
  );
  const addCompletedCall = useCallStatusTabsStore(
    (state) => state.addCompletedCall
  );
  const removeCompletedCall = useCallStatusTabsStore(
    (state) => state.removeCompletedCall
  );
  const updatePreviousState = useCallStatusTabsStore(
    (state) => state.updatePreviousState
  );
  const getFormattedCallData = useCallStatusTabsStore(
    (state) => state.getFormattedCallData
  );
  const setCompletedCalls = useCallStatusTabsStore(
    (state) => state.setCompletedCalls
  );
  const setCompletedCallPhoneNumbers = useCallStatusTabsStore(
    (state) => state.setCompletedCallPhoneNumbers
  );
  const setCompletedCallDirections = useCallStatusTabsStore(
    (state) => state.setCompletedCallDirections
  );
  const setCompletedCallBackendIds = useCallStatusTabsStore(
    (state) => state.setCompletedCallBackendIds
  );
  const completedCallBackendIds = useCallStatusTabsStore(
    (state) => state.completedCallBackendIds
  );

  // Get chat store for opening conversations
  const conversations = useChatStore((state) => state.conversations);
  const setSelectedConversationId = useChatStore(
    (state) => state.setSelectedConversationId
  );

  // Get formatted active calls using the store function
  const activeCalls = getFormattedCallData(
    callSessions,
    callStatuses,
    phoneNumbers,
    callDurations,
    isOnHold,
    activeCallIds
  );

  // Use refs to track previous values and prevent infinite loops
  const prevActiveCallIdsRef = useRef([]);
  const hasProcessedRef = useRef(false);

  // Display status mapping
  const getDisplayStatus = (callStatus, direction) => {
    const statusMap = {
      answered:
        direction === "incoming" ? "Incoming Completed" : "Outgoing Completed",
      missed: "Missed Call",
      no_answer: "Not Answered",
    };
    return statusMap[callStatus] || callStatus;
  };

  // Use the utility function directly - it already handles duration > 0 correctly
  // The determineCallStatus function checks duration first, which is the correct logic

  // Hydrate missed/not-answered calls from backend so tabs survive refresh/navigation.
  useEffect(() => {
    const fetchCompletedCalls = async () => {
      try {
        // Fetch all call status records and filter for missed/no_answer on client side
        const response = await fetchAllCallStatus({
          page: 1,
          limit: 50, // Fetch more to filter
          sortBy: "time",
          sortOrder: "DESC",
        });

        if (response?.data?.callStatusRecords) {
          // Filter for only missed and not answered calls
          const filteredCalls = response.data.callStatusRecords.filter(
            (record) => {
              const status = record.status || "";
              return (
                status === "Missed Call" ||
                status === "Not Answered" ||
                status.includes("Missed") ||
                status.includes("Not Answered")
              );
            }
          );

          const calls = filteredCalls.map((record) => ({
            id: record._id,
            status: record.status,
            phoneNumber: record.phoneNumber,
            direction: record.direction,
            duration: record.duration || 0,
            time: new Date(record.time || record.createdAt).toLocaleTimeString(
              [],
              { hour: "2-digit", minute: "2-digit" }
            ),
            timestamp: new Date(record.time || record.createdAt).getTime(),
            backendId: record._id,
          }));

          // Store in maps
          const phoneNumbersMap = new Map();
          const directionsMap = new Map();
          const backendIdsMap = new Map();

          calls.forEach((call) => {
            phoneNumbersMap.set(call.id, call.phoneNumber);
            directionsMap.set(call.id, call.direction);
            backendIdsMap.set(call.id, call.backendId);
          });

          setCompletedCalls(calls);
          setCompletedCallPhoneNumbers(phoneNumbersMap);
          setCompletedCallDirections(directionsMap);
          setCompletedCallBackendIds(backendIdsMap);
        }
      } catch (error) {
        console.error("Error fetching completed calls:", error);
      }
    };

    fetchCompletedCalls();
  }, [
    setCompletedCalls,
    setCompletedCallPhoneNumbers,
    setCompletedCallDirections,
    setCompletedCallBackendIds,
  ]);

  // Detect active->inactive transitions and convert only missed/no-answer calls
  // into "completed tabs" entries (answered calls are intentionally excluded).
  useEffect(() => {
    // CRITICAL: Update previous state FIRST, before processing completed calls
    // This ensures we capture the duration while it's still in the store
    // Track call directions for active calls
    const currentDirections = new Map();
    activeCallIds.forEach((sessionId) => {
      const session = callSessions.get(sessionId);
      const status = callStatuses.get(sessionId) || "";
      const detection = detectCallDirection(session, status);
      currentDirections.set(sessionId, detection.direction);
    });

    // Update previous state tracking with CURRENT state (before any deletions)
    // This captures durations while they're still in the store
    updatePreviousState({
      activeCallIds: [...activeCallIds],
      phoneNumbers: phoneNumbers,
      callStatuses: callStatuses,
      callDurations: callDurations, // Capture current durations
      callDirections: currentDirections,
    });

    // Check if activeCallIds actually changed
    const activeCallIdsChanged =
      prevActiveCallIdsRef.current.length !== activeCallIds.length ||
      prevActiveCallIdsRef.current.some(
        (id, index) => id !== activeCallIds[index]
      );

    // On first run, just store the current state and return
    if (!hasProcessedRef.current) {
      prevActiveCallIdsRef.current = [...activeCallIds];
      hasProcessedRef.current = true;
      return;
    }

    if (!activeCallIdsChanged) {
      return; // No changes, skip processing
    }

    // Find calls that were active but are no longer active (completed calls)
    const completedCallIds = prevActiveCallIdsRef.current.filter(
      (id) => !activeCallIds.includes(id)
    );

    if (completedCallIds.length > 0) {
      // Get fresh previous state from store
      const storeState = useCallStatusTabsStore.getState();
      const prevStatuses = storeState.previousCallStatuses;
      const prevDurations = storeState.previousCallDurations;
      const prevPhoneNumbers = storeState.previousPhoneNumbers;
      const prevDirections = storeState.previousCallDirections;

      // CRITICAL: Get preserved data from call center store
      // The store preserves durations, statuses, and phone numbers before deletion
      const currentCallCenterState = useCallCenterStore.getState();
      const preservedDurations = currentCallCenterState.completedCallDurations;
      const preservedStatuses = currentCallCenterState.completedCallStatuses;
      const preservedPhoneNumbers =
        currentCallCenterState.completedCallPhoneNumbers;
      const currentDurations = currentCallCenterState.callDurations;

      // Process completed calls asynchronously
      (async () => {
        for (const sessionId of completedCallIds) {
          // Get the final status, duration, and phone number
          // Priority: preserved data > current store > previous state
          const finalStatus =
            preservedStatuses.get(sessionId) ||
            prevStatuses.get(sessionId) ||
            "Call ended";
          let finalDuration = preservedDurations.get(sessionId);
          if (finalDuration === undefined || finalDuration === null) {
            finalDuration = currentDurations.get(sessionId);
          }
          if (finalDuration === undefined || finalDuration === null) {
            finalDuration = prevDurations.get(sessionId) || 0;
          }
          // Get phone number with priority: preserved > previous state
          let phoneNumber = preservedPhoneNumbers.get(sessionId);
          if (!phoneNumber) {
            phoneNumber = prevPhoneNumbers.get(sessionId) || "Unknown";
          }
          const previousDirection = prevDirections.get(sessionId);
          const session = callSessions.get(sessionId);

          // Use utility function for direction detection
          let direction = "outgoing";
          let detectionMethod = "default";

          // First check stored direction (most reliable if available)
          if (previousDirection) {
            direction = previousDirection;
            detectionMethod = "stored-direction";
          } else {
            // Use utility function for detection
            const detection = detectCallDirection(session, finalStatus);
            direction = detection.direction;
            detectionMethod = detection.detectionMethod;
          }

          console.log(
            `🔧 Completed Call Direction Detection for ${sessionId}:`,
            {
              finalStatus,
              finalDuration,
              phoneNumber,
              sessionConstructor: session?.constructor.name,
              previousDirection,
              detectionMethod,
              determinedDirection: direction,
              hasIncomingInviteRequest: !!session?.incomingInviteRequest,
              hasOutgoingInviteRequest: !!session?.outgoingInviteRequest,
              sessionState: session?._state,
              durationFromPreserved: preservedDurations.get(sessionId),
              durationFromCurrentStore: currentDurations.get(sessionId),
              durationFromPrevious: prevDurations.get(sessionId),
              finalDurationUsed: finalDuration,
            }
          );

          // Use utility function to determine call status
          // This function checks duration > 0 first to determine if call was answered
          const callStatus = determineCallStatus(
            direction,
            finalStatus,
            finalDuration
          );

          // CRITICAL: Only process if missed or no_answer - answered calls should be filtered out
          if (callStatus === "missed" || callStatus === "no_answer") {
            const displayStatus = getDisplayStatus(
              callStatus,
              direction,
              finalDuration
            );

            // Pass raw finalStatus to store - store will use determineCallStatus to verify
            // The store uses determineCallStatus internally to filter out answered calls
            const newCall = await addCompletedCall({
              id: sessionId,
              status: finalStatus, // Pass raw status, not displayStatus
              phoneNumber,
              direction,
              duration: finalDuration,
            });

            // Save to backend only if call was added (store filters out answered calls)
            if (newCall) {
              try {
                const backendData = {
                  phoneNumber: phoneNumber,
                  status: displayStatus,
                  direction: direction,
                  duration: finalDuration,
                  time: new Date().toISOString(),
                  callStatus: callStatus,
                };

                const response = await createCallStatus(backendData);
                if (response?.data?._id) {
                  // Update backend ID mapping
                  const currentBackendIds =
                    useCallStatusTabsStore.getState().completedCallBackendIds;
                  const newBackendIds = new Map(currentBackendIds);
                  newBackendIds.set(newCall.id, response.data._id);
                  setCompletedCallBackendIds(newBackendIds);
                }
              } catch (error) {
                console.error("Error saving completed call to backend:", error);
              }
            }
          } else {
            console.log(
              "⏭️ Skipping call - answered call (not missed/no_answer):",
              {
                callStatus,
                phoneNumber,
                finalStatus,
                duration: finalDuration,
              }
            );
          }
        }
      })();
    }

    // Update ref for next comparison
    prevActiveCallIdsRef.current = [...activeCallIds];
  }, [
    activeCallIds,
    callStatuses,
    callDurations,
    phoneNumbers,
    callSessions,
    addCompletedCall,
    updatePreviousState,
  ]);

  // Reset selected index if it's out of bounds
  useEffect(() => {
    if (
      selectedActiveCallIndex >= activeCalls.length &&
      activeCalls.length > 0
    ) {
      setSelectedActiveCallIndex(0);
    }
  }, [activeCalls.length, selectedActiveCallIndex, setSelectedActiveCallIndex]);

  // Simple format for tab display (MM:SS)
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const shouldAnimate = (status) => {
    // Only animate for incoming calls that are ringing
    return (
      status === "Ringing..." ||
      (typeof status === "string" && status.startsWith("Incoming call"))
    );
  };

  const getCallIcon = (
    status,
    direction,
    duration = 0,
    isCompleted = false
  ) => {
    // Robust direction checking with multiple fallbacks
    const normalizedDirection = String(direction || "")
      .toLowerCase()
      .trim();
    const statusLower = String(status || "").toLowerCase();

    // Multiple ways to determine if it's incoming
    const isIncoming =
      normalizedDirection === "incoming" ||
      normalizedDirection === "in" ||
      statusLower.includes("incoming") ||
      status === "Missed Call";

    const iconBasePath = "/images/icons/callIcons";

    if (isCompleted) {
      // Completed calls logic
      if (status === "Incoming Completed") {
        return `${iconBasePath}/IncommingCompleted.png`;
      } else if (status === "Outgoing Completed") {
        return `${iconBasePath}/OutgoingCompleted.png`;
      } else if (status === "Missed Call") {
        return `${iconBasePath}/IncommingNotAnswered.png`;
      } else if (status === "Not Answered") {
        return `${iconBasePath}/OutgoingNotAnswered.png`;
      }
      // Fallback for other completed statuses
      else {
        return isIncoming
          ? `${iconBasePath}/IncommingNotAnswered.png`
          : `${iconBasePath}/OutgoingNotAnswered.png`;
      }
    } else {
      // Active calls logic
      const isConnected =
        status === "Call connected" ||
        status === "Call accepted" ||
        status === "On Hold";
      const isConnecting =
        status === "Ringing..." ||
        status === "Trying..." ||
        status === "Connecting..." ||
        (typeof status === "string" &&
          (status.startsWith("Incoming call") || status.startsWith("Calling")));

      if (isConnected) {
        return isIncoming
          ? `${iconBasePath}/IncommingConnected.png`
          : `${iconBasePath}/OutgoingConnected.png`;
      } else if (isConnecting) {
        return isIncoming
          ? `${iconBasePath}/IncommingConnecting.png`
          : `${iconBasePath}/OutgoingConnecting.png`;
      }
    }

    // Default fallback
    return isIncoming
      ? `${iconBasePath}/IncommingConnecting.png`
      : `${iconBasePath}/OutgoingConnecting.png`;
  };

  const renderCallIcon = (
    status,
    direction,
    duration = 0,
    isCompleted = false
  ) => {
    const iconPath = getCallIcon(status, direction, duration, isCompleted);
    const altText = isCompleted
      ? `${direction} call ${status.toLowerCase()}`
      : `${direction} call ${status.toLowerCase()}`;

    return (
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
        <Image
          src={iconPath}
          width={50}
          height={50}
          className="object-contain"
          alt={altText}
          priority={true}
          unoptimized={true}
          onError={(e) => {
            console.warn(`Failed to load icon: ${iconPath}`);
            // Use a more reliable fallback path
            e.target.src = "/images/icons/callIcons/OutgoingConnecting.png";
          }}
        />
      </div>
    );
  };

  const getStatusColor = (status, isCompleted = false) => {
    if (isCompleted) {
      if (status.includes("Completed"))
        return "text-green-600 dark:text-green-500";
      if (status === "Missed Call" || status === "Not Answered")
        return "text-red-500 dark:text-red-400";
    } else {
      if (status === "Call connected" || status === "Call accepted")
        return "text-green-600 dark:text-green-500";
      if (status.includes("failed") || status.includes("rejected"))
        return "text-red-500 dark:text-red-400";
      if (status === "On Hold") return "text-amber-600 dark:text-amber-500";
      if (status.startsWith("Incoming call"))
        return "text-blue-600 dark:text-blue-400";
    }
    return "text-slate-600 dark:text-slate-400";
  };

  const getCompletedCallBackground = (status) => {
    if (status.includes("Completed"))
      return "bg-green-100 border-green-200 dark:bg-green-900/20 dark:border-green-800/50";
    if (status === "Missed Call" || status === "Not Answered")
      return "bg-slate-100 border-slate-300 dark:bg-slate-800/50 dark:border-slate-700";
    return "bg-white border-gray-200 dark:bg-card dark:border-border";
  };

  // Only show if there are active calls or completed calls
  if (activeCalls.length === 0 && completedCalls.length === 0) {
    return null;
  }

  const handleClickActiveCall = (index) => {
    setSelectedActiveCallIndex(index);
    setShowCallModal(true);

    // Also open the chat for this call
    const call = activeCalls[index];
    if (call?.phoneNumber) {
      handleCallTabClick(call.phoneNumber, "active");
    }
  };

  const handleCloseCompletedCall = async (id) => {
    // Get backend ID before removing
    const backendId = completedCallBackendIds.get(id);

    // Remove from store
    removeCompletedCall(id);

    // Delete from backend if backend ID exists
    if (backendId) {
      try {
        await deleteCallStatus(backendId);
      } catch (error) {
        console.error("Error deleting call status from backend:", error);
      }
    }
  };

  // const handleCallTabClick = (phoneNumber, callType = "completed") => {
  //   if (!phoneNumber || phoneNumber === "Unknown") {
  //     console.log("⚠️ Cannot open chat: Invalid phone number");
  //     return;
  //   }

  //   // Clean phone number (remove formatting, spaces, etc.)
  //   const cleanNumber = phoneNumber.replace(/\D/g, "");

  //   console.log("🔍 Searching for chat with phone:", {
  //     original: phoneNumber,
  //     cleaned: cleanNumber,
  //   });

  //   // Find chat that matches this phone number
  //   const matchingChat = conversations.find((chat) => {
  //     const contact = chat.contactData || chat.contact || {};
  //     const chatPhone = (
  //       contact.phone ||
  //       contact.identifiers?.phone ||
  //       contact.identifiers?.sms ||
  //       ""
  //     ).replace(/\D/g, "");

  //     // Check if numbers match (compare last 10 digits for better matching)
  //     const chatLast10 = chatPhone.slice(-10);
  //     const searchLast10 = cleanNumber.slice(-10);

  //     return chatLast10 === searchLast10 && chatLast10.length === 10;
  //   });

  //   if (matchingChat) {
  //     console.log("✅ Found matching chat:", matchingChat._id);
  //     setSelectedConversationId(matchingChat._id);
  //     // Navigate to the conversation page
  //     router.push(`/c/conversations/${matchingChat._id}`);
  //   } else {
  //     console.log("❌ No chat found for phone number:", phoneNumber);
  //   }
  // };


  const handleCallTabClick = async (phoneNumber, callType = "completed") => {
    if (!phoneNumber || phoneNumber === "Unknown") {
      console.log("⚠️ Cannot open chat: Invalid phone number");
      return;
    }

    // Normalize ONCE
    const normalizedSearchPhone = normalizePhone(phoneNumber);
    
    if (!normalizedSearchPhone || normalizedSearchPhone.length < 10) {
      console.log("⚠️ Cannot open chat: Normalized phone number too short", normalizedSearchPhone);
      return;
    }

    // Use last 10 digits for matching
    const searchLast10 = normalizedSearchPhone.slice(-10);
    
    if (searchLast10.length !== 10) {
      console.log("⚠️ Cannot open chat: Search phone number doesn't have 10 digits", searchLast10);
      return;
    }

    console.log("🔍 Searching for chat with phone:", {
      original: phoneNumber,
      normalized: normalizedSearchPhone,
      searchLast10,
      totalConversations: conversations.length
    });

    // Fast path: try local conversation cache first.
    let matchingChat = conversations.find((chat) => {
      const contact = chat.contactData || chat.contact || {};

      // Check all possible phone identifier fields
      const chatPhones = [
        contact.phone,
        contact.identifiers?.phone,
        contact.identifiers?.sms,
        contact.identifiers?.whatsapp,
      ].filter(Boolean); // Remove empty values

      // Check if any of the contact's phone numbers match
      for (const chatPhone of chatPhones) {
        if (!chatPhone) continue;
        
        const normalizedChatPhone = normalizePhone(String(chatPhone));
        if (!normalizedChatPhone || normalizedChatPhone.length < 10) continue;
        
        const chatLast10 = normalizedChatPhone.slice(-10);

        // Match if last 10 digits are the same
        if (chatLast10 === searchLast10 && chatLast10.length === 10) {
          console.log("✅ Match found in store:", {
            chatPhone,
            normalizedChatPhone,
            chatLast10,
            searchLast10
          });
          return true;
        }
      }

      return false;
    });

    // Fallback: query server conversations by normalized number.
    if (!matchingChat) {
      try {
        
        const response = await queryClient.fetchQuery({
          queryKey: ['conversations', { search: normalizedSearchPhone, status: 'active' }],
          queryFn: async () => {
            const response = await apiClient.get('/conversations', {
              params: {
                status: 'active',
                search: normalizedSearchPhone,
                limit: 50
              }
            });
            return response;
          },
          staleTime: 30000, // Cache for 30 seconds
        });

        const apiConversations = response?.data?.data || response?.data || [];

        // Search in API results
        matchingChat = apiConversations.find((chat) => {
          const contact = chat.contactData || chat.contact || {};

          // Check all possible phone identifier fields
          const chatPhones = [
            contact.phone,
            contact.identifiers?.phone,
            contact.identifiers?.sms,
            contact.identifiers?.whatsapp,
          ].filter(Boolean);

          for (const chatPhone of chatPhones) {
            if (!chatPhone) continue;
            
            const normalizedChatPhone = normalizePhone(String(chatPhone));
            if (!normalizedChatPhone || normalizedChatPhone.length < 10) continue;
            
            const chatLast10 = normalizedChatPhone.slice(-10);

            if (chatLast10 === searchLast10 && chatLast10.length === 10) {
              console.log("✅ Match found in API:", {
                chatPhone,
                normalizedChatPhone,
                chatLast10,
                searchLast10
              });
              return true;
            }
          }

          return false;
        });
      } catch (error) {
        console.error("❌ Error fetching conversations from API:", error);
      }
    }

    if (matchingChat) {
      console.log("✅ Found matching chat:", matchingChat._id);
      setSelectedConversationId(matchingChat._id);
      router.push(`/c/conversations/${matchingChat._id}`);
    } else {
      console.log("❌ No chat found for phone number:", phoneNumber, {
        normalized: normalizedSearchPhone,
        searchLast10,
        totalConversations: conversations.length
      });
    }
  };



  const handleCompletedCallClick = (call) => {
    const phoneNumber =
      call.phoneNumber || completedCallPhoneNumbers.get(call.id);
    if (phoneNumber) {
      handleCallTabClick(phoneNumber, "completed");
    }
  };

  return (
    <div className="w-full bg-slate-50 dark:bg-muted/30 cursor-pointer scrollbar-hide overflow-x-auto border-b border-slate-200 dark:border-border py-1">
      <div className="px-1">
        <div className="flex py-1 items-center cursor-pointer space-x-3 overflow-x-auto scrollbar-hide">
          {/* Completed Calls */}
          {completedCalls?.map((call) => (
            <div
              key={`completed-${call.id}`}
              className={`min-w-[130px] h-11 rounded-lg px-3 py-2 flex items-center gap-2.5 shadow-sm hover:shadow-md transition-all duration-200 flex-shrink-0 ${getCompletedCallBackground(
                call.status
              )}`}
              onClick={() => handleCompletedCallClick(call)}
            >
              {renderCallIcon(call.status, call.direction, call.duration, true)}

              <div className="flex-1 min-w-0">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger className="w-full text-left">
                      <ContactNameDisplay
                        phoneNumber={
                          call.phoneNumber ||
                          completedCallPhoneNumbers.get(call.id) ||
                          "Unknown"
                        }
                      />
                      <div
                        className={`text-[10px] font-medium ${getStatusColor(
                          call.status,
                          true
                        )} truncate`}
                      >
                        {call.status}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="bg-slate-800 dark:bg-popover text-white dark:text-popover-foreground border-0 dark:border"
                    >
                      <ContactTooltipContent
                        phoneNumber={
                          call.phoneNumber ||
                          completedCallPhoneNumbers.get(call.id) ||
                          "Unknown"
                        }
                        status={call.status}
                        duration={call.duration}
                        time={call.time}
                        direction={call.direction}
                      />
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <button
                className="w-4 h-4 rounded-full bg-slate-400 hover:bg-slate-500 flex items-center justify-center transition-colors duration-200 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseCompletedCall(call.id);
                }}
                aria-label="Close completed call"
              >
                <X className="w-2.5 h-2.5 text-white" />
              </button>
            </div>
          ))}

          {/* Active Calls */}
          {activeCalls.map((call, index) => (
            <div
              key={`active-${call.id}`}
              className={`min-w-[130px] h-11 bg-white dark:bg-card rounded-lg px-3 py-2 flex items-center gap-2.5 border-2 shadow-sm hover:shadow-lg transition-all duration-200 flex-shrink-0 cursor-pointer
                ${index === selectedActiveCallIndex
                  ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200 ring-opacity-50 dark:bg-blue-900/20 dark:border-blue-500 dark:ring-blue-900/50"
                  : "border-slate-200 hover:border-slate-300 dark:border-border dark:hover:border-slate-700"
                }
                ${shouldAnimate(call.status) ? "animate-pulse" : ""}
              `}
              onClick={() => handleClickActiveCall(index)}
            >
              {renderCallIcon(
                call.status,
                call.direction,
                call.duration,
                false
              )}

              <div className="flex-1 min-w-0">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger className="w-full text-left">
                      <ContactNameDisplay phoneNumber={call.phoneNumber || "Unknown"} />
                      <div
                        className={`text-[10px] font-medium ${getStatusColor(
                          call.status
                        )} truncate`}
                      >
                        {call.status
                          .replace("Incoming call", "Incoming")
                          .replace("Call ", "")}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="bg-slate-800 dark:bg-popover text-white dark:text-popover-foreground border-0 dark:border"
                    >
                      <ContactTooltipContent
                        phoneNumber={call.phoneNumber || "Unknown"}
                        status={call.status}
                        duration={call.duration}
                        direction={call.direction}
                        isOnHold={call.isOnHold}
                      />
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Hold/Resume indicator */}
              {call.isOnHold ? (
                <div className="w-5 h-5 rounded-full bg-amber-500 flex-shrink-0 flex items-center justify-center">
                  <Pause className="w-3 h-3 text-white" />
                </div>
              ) : (
                (call.status === "Call connected" ||
                  call.status === "Call accepted") && (
                  <div className="w-5 h-5 rounded-full bg-green-500 flex-shrink-0 flex items-center justify-center">
                    <Play className="w-3 h-3 text-white" />
                  </div>
                )
              )}

              {/* Duration for connected calls */}
              {call.duration > 0 &&
                (call.status === "Call connected" ||
                  call.status === "Call accepted") && (
                  <div className="text-[10px] text-slate-500 dark:text-muted-foreground font-mono bg-slate-100 dark:bg-muted px-1.5 py-0.5 rounded">
                    {formatDuration(call.duration)}
                  </div>
                )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CallStatusTabs;
