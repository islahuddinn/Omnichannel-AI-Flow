import { useState, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  Download,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import Pagination from "@/components/shared/Pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

import { getCallIcon,formatDurationHuman } from "@/utils/callCenter/callUtils";

// Call center: table of call logs with playback, pagination, and delete.

export default function HistoryTable({
  data = [],
  pagination,
  onPageChange,
  onLimitChange,
  isLoading,
  onDelete,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingId, setCurrentPlayingId] = useState(null);
  const audioRef = useRef(null);

  const handlePlay = (callId, url) => {
    if (!audioRef.current || !url) return;

    if (currentPlayingId === callId && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.src = url;
      audioRef.current.play();
      setIsPlaying(true);
      setCurrentPlayingId(callId);
    }
  };

  const handleDownload = async (recordingLink, callId) => {
    if (!recordingLink) return;

    try {
      const response = await fetch(recordingLink);
      if (!response.ok) throw new Error("Network response was not ok");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;

      // Improved filename extraction
      const filename =
        new URL(recordingLink).pathname.split("/").pop() ||
        `recording-${callId}.mp3`;
      anchor.download = filename;

      document.body.appendChild(anchor);
      anchor.click();

      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(anchor);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download recording. Please try again.");
    }
  };

  // Helper to check if recording should be shown
  const shouldShowRecording = (status, recordingLink) => {
    if (!recordingLink) return false;
    const statusLower = (status || "").toLowerCase();
    // Hide recording for missed, no_answer, busy, failed calls
    return !["missed", "no_answer", "busy", "failed"].includes(statusLower);
  };

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-muted sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-[80px]"># ID</TableHead>
              <TableHead>Caller</TableHead>
              <TableHead>Receiver</TableHead>
              <TableHead>Operator</TableHead>
              <TableHead>Date & Time</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Talk Time </TableHead>
              {/* Status Header Removed */}
              <TableHead >Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                  </div>
                </TableCell>
              </TableRow>
            ) : data.length > 0 ? (
              data.map((log) => {
                // Support both camelCase (API) and snake_case (legacy) field names
                const callId = log.cdrId || log.call_id || log._id;
                const callerNumber =
                  log.callerNumber || log.caller_number || "";
                const receiverNumber =
                  log.receiverNumber || log.reciever_number || "";
                const callLength =formatDurationHuman(parseInt(log?.cdrData?.duration))
                const talkTime =formatDurationHuman(parseInt(log?.cdrData?.talk_time));
                const recordingLink =
                  log.recordingLink || log.recording_link || null;
                const operatorName = log.operator
                  ? log.operator.name ||
                    `${log.operator.firstName || ""} ${
                      log.operator.lastName || ""
                    }`.trim() ||
                    log.operator.email ||
                    "Unknown"
                  : "Unknown";

                return (
                  <TableRow
                    key={log._id || callId}
                    className="hover:bg-muted/50"
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      #{callId.slice(-6)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-full bg-muted">
                          {getCallIcon(log.status, log.direction)}
                        </div>
                        <span className="font-medium text-foreground">
                          {callerNumber}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-foreground">
                      {receiverNumber}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {/* Operator Name */}
                        <span className="text-sm text-foreground">
                          {operatorName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.createdAt
                        ? format(new Date(log.createdAt), "dd MMM yyyy HH:mm")
                        : "-"}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-foreground">
                      {callLength}
                    </TableCell>

                    <TableCell className="font-mono text-sm text-foreground">
                      {talkTime}
                    </TableCell>

                    {/* Status Cell Removed */}
                    <TableCell>
                      <div className="flex items-center justify-start gap-2">
                        {shouldShowRecording(log.status, recordingLink) ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                              onClick={() => handlePlay(callId, recordingLink)}
                            >
                              {isPlaying && currentPlayingId === callId ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                handleDownload(recordingLink, callId)
                              }
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null}

                        {/* Delete Action */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will
                                permanently delete the call log.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(log._id || callId)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No call history found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination at the bottom */}
      <div className="border-t p-2">
        <Pagination
          pagination={pagination}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      </div>

      {/* Hidden Audio Player */}
      <audio
        ref={audioRef}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentPlayingId(null);
        }}
        className="hidden"
      />
    </div>
  );
}
