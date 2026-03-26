import React from "react";
import { parseSummary } from "@/utils/callCenter/callUtils";

function SummaryDescCard({ summary }) {
  const summarySections = parseSummary(summary);

  return (
    <div className="bg-card rounded-[14px] px-4 py-[14px] border border-border shadow-[0px_10px_24px_0px_#0F172A12]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold text-xs text-foreground">Summary</h2>
        {/* <button className="text-[10px] font-normal border border-border px-[10px] py-[5px] rounded-full hover:bg-muted text-foreground">
                    Translate to Original
                </button> */}
      </div>
      {summarySections.length > 0 ? (
        <div className="space-y-3">
          {summarySections.map((section, index) => (
            <div key={index} className="text-[10px] text-muted-foreground font-normal leading-relaxed">
              {section.title ? (
                <>
                  <span className="font-semibold text-foreground">{section.number}. {section.title}:</span>
                  <span className="ml-1">{section.content}</span>
                </>
              ) : (
                <span>{section.content}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground font-normal leading-relaxed">
          {summary || "No summary available."}
        </p>
      )}
    </div>
  );
}

export default SummaryDescCard;
