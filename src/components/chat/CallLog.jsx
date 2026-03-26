import React, { useState, useRef, useEffect, useCallback } from 'react';
import { formatCallLength, formatDurationHuman, getCallIcon, parseSummary } from '@/utils/callCenter/callUtils';
import PhoneFormatter from "@/components/shared/PhoneFormatter";
import { Play, Pause, MessageSquareText, X, User, CheckCircle, Users } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const CallLog = ({ message, onOpen, onClose, isOpen, conversationId }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [sheetContent, setSheetContent] = useState({ type: '', title: '', content: '' });
    const [isResolving, setIsResolving] = useState(false);
    const [isResolved, setIsResolved] = useState(message?.isResolved || false);
    const audioRef = useRef(null);
    const queryClient = useQueryClient();

    const handleEnded = useCallback(() => setIsPlaying(false), []);
    const handlePause = useCallback(() => setIsPlaying(false), []);
    const handlePlay = useCallback(() => setIsPlaying(true), []);

    useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            audio.addEventListener('ended', handleEnded);
            audio.addEventListener('pause', handlePause);
            audio.addEventListener('play', handlePlay);
        }

        return () => {
            if (audio) {
                audio.removeEventListener('ended', handleEnded);
                audio.removeEventListener('pause', handlePause);
                audio.removeEventListener('play', handlePlay);
            }
        };
    }, [handleEnded, handlePause, handlePlay]);

    // Sync isResolved state when message prop changes
    useEffect(() => {
        setIsResolved(message?.isResolved || false);
    }, [message?.isResolved]);

    const handleAudioToggle = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
        }
    };

    const handleMenuItemClick = (type) => {
        let content = '';
        let title = '';

        if (type === 'transcript') {
            title = 'Call Transcript';
            content = message?.transcript || 'Transcript is in process by AI.';
        }

        setSheetContent({ type, title, content });
        onOpen(true); // Ensure parent knows it's open
        setIsDropdownOpen(false);
    };

    // Update all related call logs in the messages-infinite cache so the list re-renders in real time.
    // Use setQueriesData with prefix key so every variant (channel, isMerged) for this conversation is updated.
    const updateRelatedCallLogsInCache = useCallback((resolvedCallLog, resolvedCount) => {
        if (!conversationId) return;

        const callLogTime = new Date(resolvedCallLog.createdAt);
        const fromTime = new Date(callLogTime.getTime() - 24 * 60 * 60 * 1000);

        queryClient.setQueriesData(
            { queryKey: ['messages-infinite', conversationId], exact: false },
            (oldData) => {
                if (!oldData?.pages) return oldData;

                const updatedPages = oldData.pages.map(page => {
                    if (!page.data) return page;

                    const updatedData = page.data.map(item => {
                        if (item.type !== 'callLog' && !item.cdrId) return item;

                        const isRelatedCallLog =
                            item._id !== resolvedCallLog._id &&
                            (item.direction === 'incoming' || item.direction === 'inbound' ||
                                item.cdrData?.direction === 'in' || item.cdrData?.direction === 'IN') &&
                            (item.status === 'missed' || item.status === 'no_answer') &&
                            item.callerNumber === resolvedCallLog.callerNumber &&
                            !item.isResolved &&
                            new Date(item.createdAt) >= fromTime &&
                            new Date(item.createdAt) <= callLogTime;

                        if (isRelatedCallLog || item._id === resolvedCallLog._id) {
                            return { ...item, isResolved: true };
                        }
                        return item;
                    });

                    return { ...page, data: updatedData };
                });

                return { ...oldData, pages: updatedPages };
            }
        );
    }, [conversationId, queryClient]);

    const handleMarkAsResolved = async () => {
        if (!message?._id || !message?.cdrId) {
            toast.error("Call log ID is missing");
            return;
        }

        setIsResolving(true);

        try {
            const data = await apiClient.put(`/call-logs/${message._id}`);

            if (!data?.success) {
                throw new Error(data?.message || "Failed to mark as resolved");
            }

            setIsResolved(true);

            const resolvedCount = Number(data.resolvedCount) || 1;

            // Update cache for related call logs
            if (conversationId) {
                updateRelatedCallLogsInCache(message, resolvedCount);
            }

            // ✅ Correct success message handling
            toast.success(
                resolvedCount > 1
                    ? `${resolvedCount} call logs marked as resolved`
                    : data.message || "Call log marked as resolved"
            );
        } catch (error) {
            console.error("Error marking call log as resolved:", error);

            toast.error(
                error?.response?.data?.message ||
                error.message ||
                "Failed to mark call log as resolved"
            );
        } finally {
            setIsResolving(false);
        }
    };


    const hasSummary = message?.summary && message?.summary?.trim() !== '';

    // Check if call was missed or no answer
    const isMissedOrNoAnswer = message?.status === "missed" ||
        message?.status === "Canceled" ||
        message?.status === "Busy" ||
        message?.status === "no_answer";

    // Check if this is an incoming missed call that can be marked as resolved
    const isIncomingMissed = message?.direction === "incoming" || message?.direction === "inbound" ||
        message?.cdrData?.direction === "in" || message?.cdrData?.direction === "IN";
    const canMarkAsResolved = isIncomingMissed &&
        (message?.status === "missed" || message?.status === "no_answer") &&
        !isResolved;

    // Format talk time from cdrData
    const getTalkTime = () => {
        if (isMissedOrNoAnswer) return "No answer";
        const talkTime = message?.cdrData?.talk_time;
        if (!talkTime) return "0 sec";
        // talk_time is a string like "9", convert to number and format
        const seconds = parseInt(talkTime, 10);
        if (isNaN(seconds)) return "0 sec";
        return formatDurationHuman(seconds);
    };

    // Helper for displaying time. Uses message.createdAt or falls back to Date.now() if missing
    const displayTime = message?.createdAt
        ? new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        })
        : "";


    return (
        <>
            <div className="w-[280px] lg:w-[320px] bg-white dark:bg-card rounded-lg shadow-sm border border-gray-200 dark:border-border overflow-hidden pointer-events-auto">

                {/* Header Section */}
                <div className="px-3 py-2.5 bg-gray-50 dark:bg-muted/50 border-b border-gray-200 dark:border-border">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-gray-500/50 dark:bg-gray-700/50 shadow-sm border border-gray-200 dark:border-gray-600 flex justify-center items-center rounded-full">
                                {getCallIcon(message?.status, message?.direction)}
                            </div>

                            <div>
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-foreground">Voice Call</h4>
                                <p className="text-[10px] text-gray-500 dark:text-muted-foreground mt-0.5">
                                    {getTalkTime()}
                                </p>
                            </div>
                        </div>

                        {/* Action Buttons - Only show for answered calls */}
                        {!isMissedOrNoAnswer && (
                            <div className="flex items-center gap-1">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                onClick={() => handleMenuItemClick("transcript")}
                                                className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-gray-100 dark:hover:bg-accent transition-colors"
                                            >
                                                <MessageSquareText className="w-4 h-4 text-gray-600 dark:text-muted-foreground" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Transcript</p>
                                        </TooltipContent>
                                    </Tooltip>

                                    {(message?.recordingLink || message?.recording_link) && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={handleAudioToggle}
                                                    className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-gray-100 dark:hover:bg-muted transition-colors"
                                                >
                                                    {isPlaying ? (
                                                        <Pause className="w-4 h-4 text-gray-600 dark:text-muted-foreground" />
                                                    ) : (
                                                        <Play className="w-4 h-4 text-gray-600 dark:text-muted-foreground" />
                                                    )}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>{isPlaying ? "Pause" : "Play"}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                </TooltipProvider>
                            </div>
                        )}
                    </div>
                </div>

                {/* Call Details */}
                <div className="px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-gray-500 dark:text-muted-foreground min-w-[35px]">From:</span>
                        <span className="text-gray-900 dark:text-foreground">
                            <PhoneFormatter phoneNumber={message?.callerNumber || message?.caller_number || message?.from} />
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-gray-500 dark:text-muted-foreground min-w-[35px]">To:</span>
                        <span className="text-gray-900 dark:text-foreground">
                            <PhoneFormatter phoneNumber={message?.receiverNumber || message?.reciever_number || message?.to} />
                        </span>
                    </div>


                </div>

                {/* Summary Section - Only show for answered calls */}
                {hasSummary && !isMissedOrNoAnswer && (() => {
                    const summarySections = parseSummary(message?.summary);
                    return (
                        <div className="px-3 py-2 bg-blue-50/50 dark:bg-blue-900/10 border-t border-gray-100 dark:border-border">
                            <h3 className="text-[13px] font-semibold text-gray-600 dark:text-muted-foreground uppercase mb-1.5">
                                Summary
                            </h3>
                            {summarySections.length > 0 ? (
                                <div className="space-y-2">
                                    {summarySections.map((section, index) => (
                                        <div key={index} className="text-xs text-gray-700 dark:text-foreground leading-relaxed">
                                            {section.title ? (
                                                <>
                                                    <span className="font-semibold">{section.number}. {section.title}:</span>
                                                    <span className="ml-1">{section.content}</span>
                                                </>
                                            ) : (
                                                <span>{section.content}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-700 dark:text-foreground leading-relaxed">
                                    {message?.summary}
                                </p>
                            )}
                        </div>
                    );
                })()}

                {/* Mark as Resolved Button - Only show for incoming missed calls */}
                {canMarkAsResolved && (
                    <div className="px-3 py-2 border-t border-gray-100 dark:border-border">
                        <Button
                            onClick={handleMarkAsResolved}
                            disabled={isResolving}
                            size="sm"
                            variant="outline"
                            className="w-full h-8 text-xs"
                        >
                            {isResolving ? (
                                <>
                                    <span className="animate-spin mr-2">⏳</span>
                                    Marking as resolved...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-3 h-3 mr-1.5" />
                                    Mark as Resolved
                                </>
                            )}
                        </Button>
                    </div>
                )}

                {/* Resolved Badge - Show if already resolved */}
                {isResolved && isIncomingMissed && isMissedOrNoAnswer && (
                    <div className="px-3 py-2 border-t border-gray-100 bg-green-50/50 dark:bg-green-900/50">
                        <div className="flex items-center gap-1.5 text-[11px] text-green-700 dark:text-green-300">
                            <CheckCircle className="w-3 h-3" />
                            <span className="font-medium">Resolved</span>
                        </div>
                    </div>
                )}


                {/* Footer */}

                <div className="px-3 py-2 border-t border-gray-100 dark:border-border flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* Operator / System */}
                        <div className="flex items-center gap-1.5 min-w-0">
                            <User className="w-3 h-3 text-gray-400 dark:text-muted-foreground flex-shrink-0" />
                            <span className="text-[10px] text-gray-600 dark:text-muted-foreground truncate" title={message?.operator ? `${message.operator.firstName || ""} ${message.operator.lastName || ""}`.trim() || message.operator.email : message?.operatorName || "System"}>
                                {message?.operator
                                    ? `${message.operator.firstName || ""} ${message.operator.lastName || ""}`.trim() ||
                                    message.operator.email ||
                                    "Unknown"
                                    : message?.operatorName || "System"}
                            </span>
                        </div>


                    </div>

                    {/* Time */}
                    <span className="text-[10px] text-gray-500 dark:text-muted-foreground whitespace-nowrap flex-shrink-0">
                        {displayTime}
                    </span>
                </div>

                {/* Hidden Audio Element */}
                {(message?.recordingLink || message?.recording_link) && (
                    <audio ref={audioRef} preload="metadata">
                        <source src={message.recordingLink || message.recording_link} type="audio/mpeg" />
                        Your browser does not support the audio element.
                    </audio>
                )}
            </div>

            {/* Floating Transcript Panel */}
            {isOpen && sheetContent?.type === "transcript" && (
                <div
                    className="fixed right-0 top-[57%] -translate-y-1/2 w-[380px] sm:w-[480px]
            bg-white dark:bg-background shadow-xl border-l border-gray-200 dark:border-border rounded-l-xl
            z-[1000] pointer-events-auto
            animate-slide-in transition-all overflow-hidden opacity-100"
                    style={{
                        height: "calc(100vh - 17.6rem)",
                        pointerEvents: "auto"
                    }}
                >
                    {/* Header */}
                    <div className="bg-gray-50 dark:bg-muted/50 px-5 py-3.5 border-b border-gray-200 dark:border-border">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold text-base text-gray-900 dark:text-foreground flex items-center gap-2">
                                <MessageSquareText className="w-4 h-4" />
                                {sheetContent.title}
                            </h2>
                            <button
                                onClick={() => onClose(false)}
                                className="w-7 h-7 rounded-full hover:bg-gray-200 flex items-center justify-center transition-colors"
                            >
                                <X className="w-4 h-4 text-gray-600 dark:text-muted-foreground" />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-muted-foreground mt-1.5">
                            Call ID: {message?.cdrId || message?.call_id} · {displayTime}
                        </p>
                    </div>

                    {/* Content */}
                    <div className="p-5 overflow-y-auto" style={{ height: "calc(100% - 76px)" }}>
                        <div className="bg-gray-50 dark:bg-muted/50 rounded-lg p-4 border border-gray-200 dark:border-border">
                            <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-foreground font-sans leading-relaxed">
                                {sheetContent.content}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default CallLog;
