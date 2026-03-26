"use client";

import React, { useState, useRef } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  Play,
  Pause,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  formatDate,
  formatTime,
  parseCallLengthHuman as parseCallLength, // Alias for backward compatibility in this file if needed, or update usages
  calculateAnswerTimeHuman as calculateAnswerTime,
  shouldShowRecording,
  formatDurationHuman,
} from "@/utils/callCenter/callUtils";

const CallLogsOverviewTable = ({
  callLogs = [],
  operator = null,
  isLoading = false,
}) => {
  const params = useParams();
  const slug = params.slug; // Changed from 'id' to 'slug'

  // State for audio playback
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  const getCallIcon = (direction) => {
    if (direction === "incoming") {
      return <ArrowDownLeft className="w-4 h-4 text-primary" />;
    }
    return <ArrowUpRight className="w-4 h-4 text-emerald-600" />;
  };

  const handleRecordingClick = (callLogId, recordingLink) => {
    if (playingId === callLogId) {
      // Pause current playback
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingId(null);
    } else {
      // Play new recording
      if (audioRef.current) {
        audioRef.current.pause();
      }

      audioRef.current = new Audio(recordingLink);
      audioRef.current.play();
      setPlayingId(callLogId);

      // Reset playing state when audio ends
      audioRef.current.onended = () => {
        setPlayingId(null);
      };
    }
  };

  // Stop playback on unmount
  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="w-full bg-background rounded-xl shadow-lg">
        <h1 className="text-base font-bold px-4 py-3">Loading call logs...</h1>
        <div className="p-8 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (!callLogs || callLogs.length === 0) {
    return (
      <div className="w-full bg-background rounded-xl shadow-lg">
        <h1 className="text-base font-bold px-4 py-3">
          {operator
            ? `${operator.firstName} ${operator.lastName}'s call log`
            : "Call Logs"}
        </h1>
        <div className="p-16 text-center">
          <p className="text-muted-foreground">
            No call logs found for this operator.
          </p>
        </div>
      </div>
    );
  }

  const operatorName = operator
    ? `${operator.firstName} ${operator.lastName}`
    : "Operator";

  return (
    <div className="w-full bg-card rounded-xl shadow-lg">
      <h1 className="text-base font-bold px-4 py-3">
        {operatorName}'s call log
      </h1>

      <ScrollArea className="h-[calc(100vh-350px)] w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap px-4 text-[11px] font-bold text-muted-foreground">
                Call
              </TableHead>
              <TableHead className="whitespace-nowrap px-4 text-[11px] font-bold text-muted-foreground">
                Caller Number
              </TableHead>
              <TableHead className="whitespace-nowrap px-4 text-[11px] font-bold text-muted-foreground">
                Receiver Number
              </TableHead>
              <TableHead className="whitespace-nowrap px-4 text-[11px] font-bold text-muted-foreground">
                Group Name
              </TableHead>
              <TableHead className="whitespace-nowrap px-4 text-[11px] font-bold text-muted-foreground">
                Date  
              </TableHead>
              <TableHead className="whitespace-nowrap px-4 text-[11px] font-bold text-muted-foreground">
                Talking Time
              </TableHead>
              <TableHead className="whitespace-nowrap px-4 text-[11px] font-bold text-muted-foreground">
                Answer Time
              </TableHead>
              <TableHead className="whitespace-nowrap px-4 text-[11px] font-bold text-muted-foreground">
                Call Status
              </TableHead>
              <TableHead className="whitespace-nowrap px-4 text-[11px] font-bold text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {callLogs.map((log) => {
              const showRecording = shouldShowRecording(
                log.status,
                log.recordingLink
              );
              const isPlaying = playingId === log._id;

              return (
                <TableRow key={log._id}>
                  {/* Call Type & Duration */}
                  <TableCell className="whitespace-nowrap px-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted">
                        {getCallIcon(log.direction)}
                      </div>
                      <div>
                        <div className="text-xs text-foreground font-normal capitalize">
                          {log.direction}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-normal mt-1">
                          {parseCallLength(log.callLength)}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Caller Number */}
                  <TableCell className="whitespace-nowrap px-4">
                    <div className="text-xs text-foreground font-normal">
                      {log.callerNumber}
                    </div>
                  </TableCell>


                  {/* Receiver Number */}
                  <TableCell className="whitespace-nowrap px-4">
                    <div className="text-xs text-foreground font-normal">
                      {log.receiverNumber}
                    </div>
                  </TableCell>

                  {/* Group Name */}
                  <TableCell className="whitespace-nowrap px-4">
                    <div className="text-xs text-foreground font-normal">
                      {log.group?.groupName || "-"}
                    </div>
                  </TableCell>

                  {/* Date & Time */}
                  <TableCell className="whitespace-nowrap px-4">
                    <div className="text-xs text-foreground font-normal">
                      {formatDate(log.cdrData?.calldate)}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-normal mt-1">
                      {formatTime(log.cdrData?.calldate)}
                    </div>
                  </TableCell>

                  {/* Talking Time */}
                  <TableCell className="whitespace-nowrap px-4 text-xs text-foreground font-normal">
                    {formatDurationHuman(parseInt(log.cdrData?.talk_time))}
                  </TableCell>

                  {/* Answer Time */}
                  <TableCell className="whitespace-nowrap px-4 text-xs text-foreground font-normal">
                    {calculateAnswerTime(log.cdrData)}
                  </TableCell>

                  {/* Call Status */}
                  <TableCell
                    className={`whitespace-nowrap px-4 text-xs font-normal ${log.status === "answered"
                      ? "text-emerald-600"
                      : "text-destructive"
                      }`}
                  >
                    {log.status}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="whitespace-nowrap px-4">
                    <div className="flex items-center gap-1 ">
                      {showRecording && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 border-2 border-border rounded-full"
                          onClick={() =>
                            handleRecordingClick(log._id, log.recordingLink)
                          }
                        >
                          {isPlaying ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Link
                        href={`/c/call-center/statistics/call-logs-overview/${slug}/call-log-detail/${log._id}`}
                        className="h-8 w-8 flex justify-center items-center"
                      >
                    <Eye className="h-4 w-4" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};

export default CallLogsOverviewTable;
