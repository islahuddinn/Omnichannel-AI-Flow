import React from "react";

import { parseTranscript } from "@/utils/callCenter/callUtils";

const TranscriptionList = ({ transcriptions = [], isProcessing = false, isEmpty = false, isCallAnswered = true }) => {
  if (!isCallAnswered) {
    return (
      <div className="p-4 text-center text-muted-foreground text-xs">
        Call was not answered. Transcription is available only for answered calls.
      </div>
    );
  }
  if (isProcessing) {
    return (
      <div className="p-4 text-center text-muted-foreground text-xs">
        Details extraction is in progress by AI
      </div>
    );
  }

  // If no transcriptions provided, use placeholder or empty
  if (isEmpty) {
    return (
      <div className="p-4 text-center text-muted-foreground text-xs">
        No details available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-xs text-foreground">Transcription</h3>
        {/* <button className="text-[10px] font-normal bg-card hover:bg-muted text-foreground px-[10px] py-[5px] rounded-full border border-border">
          Translate to EN
        </button> */}
      </div>

      {transcriptions.map((item, idx) => {
        // Parse the inner message text into dialogue lines
        const key = `${idx}-${item.time}`;
        const dialogueLines = parseTranscript(item.message);

        // If no parsed lines (legacy/simple text), treat as single line
        const linesToRender =
          dialogueLines.length > 0
            ? dialogueLines
            : [
                {
                  speakerName: item.speakerName,
                  message: item.message,
                  time: item.time,
                },
              ];

        return (
          <div
            key={key}
            className="flex flex-col gap-2 pb-[10px] pt-6 border border-border pl-[10px] rounded-[8px] bg-card relative"
          >
            {/* Header: Speaker Info for this Segment */}
            {/* <div className="flex items-center justify-between w-full border-b border-border/50 pb-2 mb-1">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[10.3px] font-bold text-foreground shrink-0 uppercase">
                  
                  {item.speaker?.charAt(0) || "?"}
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-[11px] text-foreground">
                    {item.speakerName}
                  </span>
                  <span className="text-[9px] font-normal text-muted-foreground">
                    {item.role}
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground shrink-0 pl-2">
                {item.time}
              </div>
            </div> */}

            <div className="text-[10px] text-muted-foreground shrink-0  text-right absolute right-2 top-1 font-bold">
              {item.time}
            </div>

            {/* Inner Content: Parsed Dialogue Lines */}
            <div className="flex flex-col gap-2 pl-2">
              {linesToRender.map((line, lineIdx) => (
                <div key={`${key}-line-${lineIdx}`} className="text-[11px]">
                  <span className="font-bold text-foreground/80 mr-1">
                    {line.speakerName}:
                  </span>
                  <span className="text-muted-foreground font-normal">
                    {line.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TranscriptionList;
