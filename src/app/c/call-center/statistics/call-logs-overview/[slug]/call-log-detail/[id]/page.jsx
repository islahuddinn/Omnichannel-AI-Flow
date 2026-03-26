"use client";

import React, { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useCallSentiment } from "@/hooks/useCallSentiment";
import { CallLogDetailLoadingState } from "@/components/shared/loading-states/call-statistics";
import StatisticsErrorState from "@/components/panels/company-admin/call-center/statistics/StatisticsErrorState";
import CallLogDetailHeader from "@/components/panels/company-admin/call-center/statistics/call-log-detail/DetailHeader";
import SummaryDescCard from "@/components/panels/company-admin/call-center/statistics/call-log-detail/SummaryDescCard";
import TalkListenRatio from "@/components/panels/company-admin/call-center/statistics/call-log-detail/TalkListenRatio";
import SentimentAnalysisCard from "@/components/panels/company-admin/call-center/statistics/call-log-detail/SentimentAnalysisCard";
import CallScoreCard from "@/components/panels/company-admin/call-center/statistics/call-log-detail/CallScoreCard";
import TagsCard from "@/components/panels/company-admin/call-center/statistics/call-log-detail/TagsCard";
import RecordingContent from "@/components/panels/company-admin/call-center/statistics/call-log-detail/RecordingContent";
import Notes from "@/components/panels/company-admin/call-center/statistics/call-log-detail/Notes";
import InfoItem from "@/components/panels/company-admin/call-center/statistics/call-log-detail/InfoItem";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatDate,
  formatTime,
  parseCallLengthHuman as parseCallLength,
  calculateAnswerTimeHuman as calculateAnswerTime,
  parseTranscript,
  formatDurationHuman,
} from "@/utils/callCenter/callUtils";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

function CallLogDetail() {
  const params = useParams();
  const callLogId = params.id;
  const operatorSlug = params.slug;

  // Fetch call log detail with calllogId parameter
  const { data, isLoading, isError, error, refetch } = useCallSentiment({
    calllogId: callLogId,
  });

  const callLog = data?.data || null;

  // Prepare all derived data AT THE TOP to safely obey Rules of Hooks
  // Even if callLog is null, these hooks must run in the same order.

  const operatorName = React.useMemo(() => {
    return callLog?.operator
      ? `${callLog.operator.firstName} ${callLog.operator.lastName}`
      : "Agent";
  }, [callLog]);

  const details = React.useMemo(() => {
    if (!callLog) return {};
    // Use waitingTime from API if available, otherwise calculate from cdrData (fallback)
    const rawWaiting =
      callLog.waitingTime !== null && callLog.waitingTime !== undefined
        ? callLog.waitingTime
        : calculateAnswerTime(callLog.cdrData);
    const waitingNum = Number(rawWaiting);
    const waitingTimeStr =
      rawWaiting != null && !Number.isNaN(waitingNum) && waitingNum >= 0
        ? formatDurationHuman(waitingNum)
        : "-";
    // Use company from API if available, otherwise use group.groupName (fallback)
    const company = callLog.company || callLog.group?.groupName || "-";
    const talkTimeNum = parseInt(callLog?.cdrData?.talk_time, 10);
    const talkTimeStr =
      !Number.isNaN(talkTimeNum) && talkTimeNum >= 0
        ? formatDurationHuman(talkTimeNum)
        : "-";

    return {
      contact:
        callLog.direction === "incoming"
          ? callLog.callerNumber
          : callLog.receiverNumber,
      agent: operatorName,
      waitingTime: waitingTimeStr,
      talkTime: talkTimeStr,
      contactNumber: callLog.callerNumber,
      companyNumber: callLog.receiverNumber,
      company: company,
      wrapUpTime: "-",
      group: callLog.group?.groupName || "-",
      direction: callLog.direction,
      language: "-",
      tag:
        callLog.smartNotes && callLog.smartNotes.length > 0
          ? callLog.smartNotes[0].title
          : "-",
    };
  }, [callLog, operatorName]);

  const summary = useMemo(
    () => callLog?.summary || "No summary available.",
    [callLog]
  );

  // Provide a default description if none exists
  const scoreDescription = useMemo(
    () =>
      callLog?.overallSentiment?.description ||
      "Sentiment analysis description not available for this call.",
    [callLog]
  );

  // Determine if processing is in progress (only relevant when call was answered)
  const isProcessing = useMemo(() => {
    return callLog?.isProcessing === null || callLog?.isProcessing === true;
  }, [callLog?.isProcessing]);

  // Call was answered (connected and had conversation). AI metrics only apply to answered calls.
  // Use status + disposition first; no_answer/missed are never answered. Use talk_time to confirm.
  const isCallAnswered = useMemo(() => {
    if (!callLog) return false;
    const status = (callLog.status || "").toLowerCase();
    const disposition = (callLog.cdrData?.disposition || "").toUpperCase().trim();
    if (status === "no_answer" || status === "missed") return false;
    if (disposition === "NO ANSWER" || disposition === "MISSED" || disposition === "FAILED") return false;
    if (status === "answered" || disposition === "ANSWERED" || disposition === "CONNECTED") return true;
    const talkTime = parseInt(callLog.cdrData?.talk_time, 10);
    if (!Number.isNaN(talkTime) && talkTime > 0) return true;
    return false;
  }, [callLog]);

  // Use detailedSentiment as the source of truth if available
  const transcriptions = useMemo(() => {
    // We map 1-to-1 to cards, passing the raw text for the component to parse
    if (callLog?.detailedSentiment) {
      return callLog.detailedSentiment.map((segment) => ({
        speaker: segment.speaker === "customer" ? "Customer" : "Agent",
        role: segment.speaker === "customer" ? "Customer" : "Agent",
        speakerName: segment.speaker === "customer" ? "Customer" : operatorName,
        message: segment.text, // Raw text containing multiple turns
        time: `${segment?.startSecond}s - ${segment?.endSecond}s`,
      }));
    }

    // Fallback for string-only transcript (legacy or different format)
    if (typeof callLog?.transcript === "string") {
      const parsed = parseTranscript(callLog.transcript, operatorName);
      return parsed;
    }

    return [];
  }, [callLog?.transcript, callLog?.detailedSentiment, operatorName]);

  // Loading state
  if (isLoading) {
    return <CallLogDetailLoadingState />;
  }

  // Error state
  if (isError) {
    return (
      <div className="w-full py-8 px-8">
        <Link
          href={`/c/call-center/statistics/call-logs-overview/${operatorSlug}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Call Logs
        </Link>
        <StatisticsErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  // Empty state
  if (!callLog) {
    return (
      <div className="w-full py-8 px-8">
        <Link
          href={`/c/call-center/statistics/call-logs-overview/${operatorSlug}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Call Logs
        </Link>
        <div className="p-16 text-center">
          <p className="text-muted-foreground">Call log not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-8 px-8 space-y-4">
      <Link
        href={`/c/call-center/statistics/call-logs-overview/${operatorSlug}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Call Logs
      </Link>

      <CallLogDetailHeader
        callId={callLog.cdrId || callLog._id}
        callLog={callLog}
        date={formatDate(callLog.cdrData?.calldate)}
        time={formatTime(callLog.cdrData?.calldate)}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        {/* Scrollable Left Column (Details) */}
        <div className="lg:col-span-2 bg-card rounded-[14px] shadow-[0px_10px_24px_0px_#0F172A12] px-4 py-[14px]">
          <h2 className="font-bold text-xs text-foreground mb-4">Details</h2>

          <div className="grid grid-cols-2 md:grid-cols-3 mb-2 border border-border rounded-[8px] bg-muted">
            <InfoItem label="Contact" value={details.contact} />
            <InfoItem
              label="Agent"
              value={details.agent}
              className="rounded-tl-[8px] rounded-bl-[8px] border-s-2 border-border"
            />
            <InfoItem
              label="Waiting time"
              value={details.waitingTime}
              className="rounded-tl-[8px] rounded-bl-[8px] border-s-2 border-border"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 mb-2 border border-border rounded-[8px] bg-muted">
            <InfoItem label="Talk time" value={details.talkTime} />
            <InfoItem
              label="Caller Number"
              value={details.contactNumber}
              className="rounded-tl-[8px] rounded-bl-[8px] border-s-2 border-border"
            />
            <InfoItem
              label="Reciever Number"
              value={details.companyNumber}
              className="rounded-tl-[8px] rounded-bl-[8px] border-s-2 border-border"
            />

            {/* <InfoItem
              label="Wrap-up time"
              value={details.wrapUpTime}
              className="rounded-tl-[8px] rounded-bl-[8px] border-s-2 border-border"
            /> */}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 mb-2 border border-border rounded-[8px] bg-muted">
            <InfoItem label="Company" value={details.company} />
            <InfoItem
              label="Group"
              value={details.group}
              className="rounded-tl-[8px] rounded-bl-[8px] border-s-2 border-border"
            />
            <InfoItem
              label="Direction"
              value={details.direction}
              className="rounded-tl-[8px] rounded-bl-[8px] border-s-2 border-border capitalize"
            />
            {/* <InfoItem
              label="Call language"
              value={details.language}
              className="rounded-tl-[8px] rounded-bl-[8px] border-s-2 border-border"
            />
            <InfoItem
              label="Tag"
              value={details.tag}
              className="rounded-tl-[8px] rounded-bl-[8px] border-s-2 border-border truncate"
            /> */}
          </div>

          <Tabs defaultValue="recording" className="w-full mt-3">
            <TabsList className="w-full justify-start gap-2 bg-transparent border-b border-border p-0 mb-4 h-auto">
              <TabsTrigger
                value="recording"
                className="text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:border-b-4 data-[state=active]:border-primary flex items-center gap-2 py-2 px-[14px] rounded-t-md text-xs font-bold hover:bg-accent/50 transition-all"
              >
                Recording
              </TabsTrigger>
              <TabsTrigger
                value="notes"
                className="text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:border-b-4 data-[state=active]:border-primary flex items-center gap-2 py-2 px-[14px] rounded-t-md text-xs font-bold hover:bg-accent/50 transition-all"
              >
                Notes
              </TabsTrigger>
              {/* <TabsTrigger
                value="steps"
                className="text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:border-b-4 data-[state=active]:border-primary flex items-center gap-2 py-2 px-[14px] rounded-t-md text-xs font-bold hover:bg-accent/50 transition-all"
              >
                Call Steps
              </TabsTrigger> */}
            </TabsList>

            <TabsContent value="recording">
              <RecordingContent
                recordingLink={callLog.recordingLink}
                transcriptions={transcriptions}
                sentimentSegments={callLog.detailedSentiment}
                operatorName={operatorName}
                contactName={details.contact}
                isProcessing={isProcessing || !callLog.transcript || !callLog.detailedSentiment?.length}
                isCallAnswered={isCallAnswered}
              />
            </TabsContent>

            <TabsContent value="notes">
              <div className="p-4">
                <Notes
                  notes={callLog.smartNotes}
                  isProcessing={isProcessing || !callLog.smartNotes?.length}
                  isCallAnswered={isCallAnswered}
                />
              </div>
            </TabsContent>

            {/* <TabsContent value="steps">
                            <div className="p-4 text-center text-slate-500">
                                Call steps content (Coming soon)
                            </div>
                        </TabsContent> */}
          </Tabs>
        </div>

        {/* Sticky Right Column (Summary) */}
        <div className="space-y-3 lg:col-span-1">
          <SummaryDescCard summary={summary} />
          <TalkListenRatio
            talkPercent={callLog.talkListenRatio?.agentTalkPercentage || 0}
            listenPercent={callLog.talkListenRatio?.agentListenPercentage || 0}
            agentName={operatorName}
            isProcessing={isProcessing || !callLog.talkListenRatio}
            isCallAnswered={isCallAnswered}
          />
          <SentimentAnalysisCard
            sentiment={callLog.overallSentiment?.label || "neutral"}
            isProcessing={isProcessing || !callLog.overallSentiment?.label}
            isCallAnswered={isCallAnswered}
          />
          <CallScoreCard
            score={callLog.overallSentiment?.score || 0}
            description={scoreDescription}
            isProcessing={isProcessing || !callLog.overallSentiment}
            isCallAnswered={isCallAnswered}
          />
          {/* <TagsCard
            tags={callLog.smartNotes?.map((n) => n.title).slice(0, 3) || []}
          /> */}
        </div>
      </div>
    </div>
  );
}

export default CallLogDetail;
