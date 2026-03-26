import Image from "next/image";

// --- Call center shared utilities (direction, duration, status, icons). ---

// Production-safe call direction detection
export const detectCallDirection = (session, status) => {
    let direction = 'outgoing'; // default
    let detectionMethod = 'default';

    // Method 1: Check status string first (most reliable in production)
    if (typeof status === 'string' && status.toLowerCase().includes('incoming')) {
        direction = 'incoming';
        detectionMethod = 'status-string';
    }
    // Method 2: Check session properties (production-safe)
    else if (session) {
        if (session.incomingInviteRequest || session.autoSendAnInitialProvisionalResponse !== undefined) {
            direction = 'incoming';
            detectionMethod = 'session-properties-incoming';
        } else if (session.outgoingInviteRequest || session.outgoingRequestDelegate !== undefined) {
            direction = 'outgoing';
            detectionMethod = 'session-properties-outgoing';
        } else if (session.constructor && session.constructor.name) {
            if (session.constructor.name === 'Invitation' || session.constructor.name.includes('Invitation')) {
                direction = 'incoming';
                detectionMethod = 'constructor-name';
            }
        }
    }

    return { direction, detectionMethod };
};

// Format call duration from seconds to HH:MM:SS
export const formatCallDuration = (seconds) => {
    if (!seconds || seconds === 0) return '00:00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const formatCallLength = (callLength) => {
    if (!callLength) return "0 sec";

    // Handle different possible formats
    const parts = callLength.split(":").map(Number);

    let hours = 0, minutes = 0, seconds = 0;

    if (parts.length === 3) {
        // Format: HH:MM:SS (like "00:01:13")
        [hours, minutes, seconds] = parts;
    } else if (parts.length === 2) {
        // Format: MM:SS (like "01:13")
        [minutes, seconds] = parts;
    } else {
        // Invalid format, return original or default
        return "0 sec";
    }

    const formatUnit = (value, unit) =>
        value === 1 ? `${value} ${unit}` : value > 0 ? `${value} ${unit}s` : "";

    const formattedParts = [
        formatUnit(hours, "hr"),
        formatUnit(minutes, "min"),
        formatUnit(seconds, "sec"),
    ].filter(Boolean);

    return formattedParts.length > 0 ? formattedParts.join(" ") : "0 sec";
};

// Get the icon path based on status and direction (matching CallStatusTabs logic)
export const getCallIconPath = (status, direction) => {
    const iconBasePath = "/images/icons/callIcons";

    // Determine if incoming
    const isIncoming = direction === "incoming" || direction === "inbound";

    console.log(isIncoming, "isIncomingisIncoming");

    // For completed/historical calls
    if (status === "answered" || status === "completed") {
        return isIncoming
            ? `${iconBasePath}/IncommingCompleted.png`
            : `${iconBasePath}/OutgoingCompleted.png`;
    }

    if (status === "no_answer" && isIncoming) {
        return `${iconBasePath}/IncommingNotAnswered.png`;
    }

    if (status === "no_answer" && !isIncoming) {
        return `${iconBasePath}/OutgoingNotAnswered.png`;
    }

    // For active/connecting calls
    if (status === "connecting" || status === "ringing") {
        return isIncoming
            ? `${iconBasePath}/IncommingConnecting.png`
            : `${iconBasePath}/OutgoingConnecting.png`;
    }

    if (status === "connected" || status === "active") {
        return isIncoming
            ? `${iconBasePath}/IncommingConnected.png`
            : `${iconBasePath}/OutgoingConnected.png`;
    }

    // Default fallback
    return isIncoming
        ? `${iconBasePath}/IncommingConnecting.png`
        : `${iconBasePath}/OutgoingConnecting.png`;
};

// Updated getCallIcon to use Image components like CallStatusTabs
export const getCallIcon = (status, direction, options = {}) => {
    const {
        width = 40,
        height = 40,
        className = "w-4 h-4 lg:w-8 lg:h-8"
    } = options;

    console.log(status, "STATUSSS", direction, "")

    const iconPath = getCallIconPath(status, direction);
    const altText = `${direction} call ${status}`;

    return (
        <div className={`flex-shrink-0 flex items-center justify-center ${className}`}>
            <Image
                src={iconPath}
                width={width}
                height={height}
                className="object-contain ml-1"
                alt={altText}
                priority={true}
                unoptimized={true}
                onError={(e) => {
                    console.warn(`Failed to load icon: ${iconPath}`);
                    e.target.src = "/images/icons/callIcons/OutgoingConnecting.png";
                }}
            />
        </div>
    );
};

// Determine call status based on final state
export const determineCallStatus = (direction, finalStatus, duration) => {
    if (finalStatus.includes('failed') || finalStatus.includes('rejected') ||
        finalStatus.includes('cancelled') || finalStatus.includes('Busy') ||
        finalStatus.includes('No Answer')) {
        return direction === 'incoming' ? 'missed' : 'no_answer';
    } else if (duration > 0) {
        return 'answered';
    } else {
        return direction === 'incoming' ? 'missed' : 'no_answer';
    }
};

/**
 * Format duration from seconds to HH:MM:SS
 * Used for call log answer time and duration formatting
 */
export const formatDuration = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return null;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/**
 * Parse call length string to seconds
 * Handles formats like "MM:SS" or "HH:MM:SS"
 */
export const parseCallLength = (callLength) => {
    if (!callLength) return 0;

    const parts = callLength.split(':').map(Number);

    if (parts.length === 2) {
        const [minutes, seconds] = parts;
        return minutes * 60 + seconds;
    } else if (parts.length === 3) {
        const [hours, minutes, seconds] = parts;
        return hours * 3600 + minutes * 60 + seconds;
    }

    return 0;
};

/**
 * Calculate answer time in seconds from cdrData
 * Returns the time difference between call date and answer date
 */
export const calculateAnswerTime = (cdrData) => {
    if (!cdrData || !cdrData.calldate || !cdrData.answer) return null;
    try {
        const callDate = new Date(cdrData.calldate);
        const answerDate = new Date(cdrData.answer);
        return Math.floor((answerDate - callDate) / 1000); // Return in seconds
    } catch (error) {
        return null;
    }
};
/**
 * Parse transcript text or detailedSentiment array into a flat list of dialogue turns.
 * Handles grouped text blocks from detailedSentiment by splitting them.
 * 
 * @param {string|Array} transcriptSource - The transcript string or detailedSentiment array
 * @param {string} operatorName - The name of the agent/operator
 * @returns {Array} List of parsed transcription items
 */
// export const parseTranscript = (transcriptSource, operatorName = "Agent") => {
//     const parsed = [];
//     // Regex to parse: [SPEAKER]: <start> 'message' <end>
//     // Example: [CUSTOMER]: <0> 'Hello' <5>
//     const regex = /\[(CUSTOMER|AGENT)\]:\s*<(\d+)>?\s*'([^']*)'\s*<(\d+)>?/g;

//     const processText = (text, defaultSpeaker = "CUSTOMER") => {
//         let match;
//         // Keep track if we found any matches
//         let foundMatch = false;
        
//         while ((match = regex.exec(text)) !== null) {
//             foundMatch = true;
//             const [_, speakerRole, startTime, message] = match;
            
//             // Map roles to display names
//             const isCustomer = speakerRole === "CUSTOMER";
//             const roleLabel = isCustomer ? "Customer" : "Agent";
//             // Use specific speaker name logic from user request: 
//             // "directly show like segment.speaker" -> means "Customer" or "Agent"
//             const speakerName = isCustomer ? "Customer" : "Agent"; 
//             const speakerInitial = isCustomer ? "Customer" : "Agent";

//             parsed.push({
//                 speaker: speakerInitial, // "Customer" or "Agent"
//                 role: roleLabel,
//                 speakerName: speakerName,
//                 message: message,
//                 time: `${startTime}s`
//             });
//         }
//         return foundMatch;
//     };

//     // Case 1: transcriptSource is an Array (detailedSentiment)
//     if (Array.isArray(transcriptSource)) {
//         transcriptSource.forEach(segment => {
//             if (segment.text) {
//                 // Try to parse the text with regex
//                 const hasMatches = processText(segment.text);
                
//                 // If regex found nothing, but there is text, use the segment metadata as fallback
//                 if (!hasMatches && segment.text.trim()) {
//                      parsed.push({
//                         speaker: segment.speaker === "customer" ? "Customer" : "Agent",
//                         role: segment.speaker === "customer" ? "Customer" : "Agent",
//                         speakerName: segment.speaker === "customer" ? "Customer" : "Agent",
//                         message: segment.text,
//                         time: `${segment.startSecond}s`
//                     });
//                 }
//             }
//         });
//     } 
//     // Case 2: transcriptSource is a single String
//     else if (typeof transcriptSource === 'string') {
//         processText(transcriptSource);
//     }

//     return parsed;
// };




export const parseTranscript = (transcriptSource) => {
    const parsed = [];
    
    // Regex for your exact format
    const regex = /\[(CUSTOMER|AGENT)\]:\s*<(\d+)>\s*'([^']*)'\s*<(\d+)>/gi;
  
    // Ensure we handle both array or string
    const processText = (text) => {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const [_, speakerRole, startTime, message, endTime] = match;
  
        parsed.push({
          speaker: speakerRole === "CUSTOMER" ? "Customer" : "Agent",
          role: speakerRole === "CUSTOMER" ? "Customer" : "Agent",
          speakerName: speakerRole === "CUSTOMER" ? "Customer" : "Agent",
          message: message.trim(),
          startTime: `${startTime}s`,
          endTime: `${endTime}s`,
        });
      }
    };
  
    if (Array.isArray(transcriptSource)) {
      transcriptSource.forEach(segment => {
        if (segment.text) processText(segment.text);
      });
    } else if (typeof transcriptSource === "string") {
      processText(transcriptSource);
    }
  
    return parsed;
  };
  



/**
 * Format date string to localized format (DD. MM. YYYY)
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
export const formatDate = (dateString) => {
    if (!dateString) return "-";

    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();

    return `${day}. ${month}. ${year}`;
};

/**
 * Format time string to HH:MM format
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted time
 */
export const formatTime = (dateString) => {
    if (!dateString) return "-";

    const date = new Date(dateString);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");

    return `${hours}:${minutes}`;
};

/**
 * Format duration in seconds to human-readable format
 * Always include seconds, optionally minutes if available
 * Examples:
 *  - 34d 14h 22m 10s
 *  - 5h 30m 12s
 *  - 6m 45s
 *  - 45s
 */
export const formatDurationHuman = (seconds) => {
    const n = Number(seconds);
    if (seconds == null || Number.isNaN(n) || n <= 0) return "-";

    const days = Math.floor(n / 86400);
    const hours = Math.floor((n % 86400) / 3600);
    const minutes = Math.floor((n % 3600) / 60);
    const secs = Math.floor(n % 60);
  
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`); // always include seconds
  
    return parts.join(" ");
  };
  

/**
 * Calculate answer time from CDR data and return human readable format
 * Renamed from calculateAnswerTime to avoid conflict
 * @param {Object} cdrData - CDR data object
 * @returns {string} Formatted answer time
 */
export const calculateAnswerTimeHuman = (cdrData) => {
    if (!cdrData || !cdrData.answer || !cdrData.calldate) return "-";

    try {
        const callStart = new Date(cdrData.calldate);
        const callAnswer = new Date(cdrData.answer);
        const diffSeconds = Math.floor((callAnswer - callStart) / 1000);

        if (diffSeconds < 0) return "-";

        return formatDurationHuman(diffSeconds);
    } catch (error) {
        console.error("Error calculating answer time:", error);
        return "-";
    }
};

/**
 * Parse call length string (HH:MM:SS) to human-readable format
 * Renamed from parseCallLength to avoid conflict
 * @param {string} callLengthString - Call length in HH:MM:SS format
 * @returns {string} Formatted call length
 */
export const parseCallLengthHuman = (callLengthString) => {
    if (!callLengthString) return "-";

    const parts = callLengthString.split(":");
    if (parts.length === 3) {
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        const seconds = parseInt(parts[2]);

        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        return formatDurationHuman(totalSeconds);
    }

    return callLengthString;
};

/**
 * Check if recording should be shown based on call status
 * @param {string} status - Call status
 * @param {string} recordingLink - Recording link
 * @returns {boolean} Whether to show recording button
 */
export const shouldShowRecording = (status, recordingLink) => {
    const isMissed = status === "missed" || status === "no_answer";
    return !isMissed && !!recordingLink;
};


export const normalizePhone = (phone = "") => {
    let digits = phone.replace(/\D/g, "");
  
    // Remove leading 00 (international prefix)
    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    }

  
    return digits;
  };

/**
 * Parse formatted summary text into structured sections
 * Handles format: "1. **Title**: Content. 2. **Title**: Content. ..."
 * @param {string} summaryText - The formatted summary text
 * @returns {Array} Array of objects with {number, title, content}
 */
export const parseSummary = (summaryText) => {
    if (!summaryText || typeof summaryText !== 'string') return [];

    // Split by pattern that matches numbered sections: "number. **title**:"
    // This allows content to contain numbers without breaking the parser
    const sectionRegex = /(\d+)\.\s*\*\*([^*]+)\*\*:\s*/g;
    
    const sections = [];
    let lastIndex = 0;
    let match;
    let prevMatch = null;

    // Find all section headers
    while ((match = sectionRegex.exec(summaryText)) !== null) {
        // If we have a previous match, extract the content between them
        if (prevMatch) {
            const content = summaryText.substring(
                prevMatch.index + prevMatch[0].length,
                match.index
            ).trim();
            
            sections.push({
                number: parseInt(prevMatch[1], 10),
                title: prevMatch[2].trim(),
                content: content.replace(/\.\s*$/, '') // Remove trailing period if exists
            });
        }
        prevMatch = match;
        lastIndex = match.index + match[0].length;
    }

    // Handle the last section (content until end of string)
    if (prevMatch) {
        const content = summaryText.substring(lastIndex).trim();
        sections.push({
            number: parseInt(prevMatch[1], 10),
            title: prevMatch[2].trim(),
            content: content.replace(/\.\s*$/, '') // Remove trailing period if exists
        });
    }

    // If no sections were found, return the original text as a single section
    if (sections.length === 0) {
        return [{
            number: null,
            title: null,
            content: summaryText.trim()
        }];
    }

    return sections;
};
  