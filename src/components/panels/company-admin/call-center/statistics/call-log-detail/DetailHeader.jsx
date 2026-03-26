import { Star } from "lucide-react";

// Prefer cdrData.disposition when present (CDR truth); else use callLog.status.
function getDisplayStatus(callLog) {
  const disposition = (callLog?.cdrData?.disposition || "").toUpperCase().trim();
  if (disposition === "NO ANSWER") return "Not Answered";
  if (disposition === "MISSED" || disposition === "FAILED") return "Missed";
  if (disposition === "ANSWERED" || disposition === "CONNECTED") return "Answered";
  const status = callLog?.status;
  if (status) return status.charAt(0).toUpperCase() + String(status).slice(1).replace(/_/g, " ");
  return "Call";
}

const CallLogDetailHeader = ({ callId, callLog, date, time }) => (
  <div className="bg-muted border border-border rounded-[14px] shadow-sm px-[18px] py-[14px]">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-[30px] h-[30px] flex justify-center items-center bg-card rounded-full">
          <Star className="w-4 h-4 text-primary" fill="currentColor" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground">
            {getDisplayStatus(callLog)} {callLog?.direction === "incoming" ? "Inbound" : "Outbound"}
          </h1>
          <p className="text-[11px] text-muted-foreground font-normal">
            {date}, {time} · Your feedback helps us deliver the best experience
            to our customers.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-[11.45px] font-normal">
          Call ID: {callId}
        </span>
        {/* <button className="text-xs text-primary font-normal hover:bg-muted/70 border border-border rounded-full px-[14px] py-2 bg-card">
                    Ask me later
                </button>
                <button className="text-xs text-primary-foreground font-normal hover:bg-primary/90 border border-border rounded-full px-[14px] py-2 bg-primary">
                    Rate our AI
                </button> */}
      </div>
    </div>
  </div>
);

export default CallLogDetailHeader;
