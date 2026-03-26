import React from "react";

function TalkListenRatio({
    talkPercent = 54,
    listenPercent = 46,
    agentName = "Monika Š Junior",
    isProcessing = false,
    isCallAnswered = true,
}) {
    const circumference = 2 * Math.PI * 70;
    const talkOffset = circumference - (circumference * talkPercent) / 100;

    if (!isCallAnswered) {
        return (
            <div className="bg-card rounded-[14px] px-4 py-[14px] border border-border shadow-[0px_10px_24px_0px_#0F172A12] flex flex-col items-center">
                <h2 className="font-bold text-xs text-foreground mb-4">
                    Talk / Listen ratio
                </h2>
                <div className="py-8 text-center text-muted-foreground text-xs">
                    Call was not answered. This metric is available only for answered calls.
                </div>
            </div>
        );
    }
    if (isProcessing) {
        return (
            <div className="bg-card rounded-[14px] px-4 py-[14px] border border-border shadow-[0px_10px_24px_0px_#0F172A12] flex flex-col items-center">
                <h2 className="font-bold text-xs text-foreground mb-4">
                    Talk / Listen ratio
                </h2>
                <div className="py-8 text-center text-muted-foreground text-xs">
                    Talk listen ratio is in progress by AI
                </div>
            </div>
        );
    }

    return (
        <div className="bg-card rounded-[14px] px-4 py-[14px] border border-border shadow-[0px_10px_24px_0px_#0F172A12] flex flex-col items-center">
            <h2 className="font-bold text-xs text-foreground mb-4">
                Talk / Listen ratio
            </h2>
            <div className="flex items-center justify-center mb-4">
                <div className="relative w-40 h-40">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle
                            cx="80"
                            cy="80"
                            r="70"
                            fill="none"
                            stroke="currentColor"
                            className="text-muted"
                            strokeWidth="14"
                        />
                        <circle
                            cx="80"
                            cy="80"
                            r="70"
                            fill="none"
                            stroke="currentColor"
                            className="text-primary"
                            strokeWidth="14"
                            strokeDasharray={circumference}
                            strokeDashoffset={talkOffset}
                            strokeLinecap="round"
                        />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                            <div className="font-bold text-[11px] text-foreground px-4">
                                {agentName}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex justify-between gap-28">
                <div className="text-center">
                    <div className="text-muted-foreground text-[11.4px] font-normal">Talk</div>
                    <div className="text-foreground text-[11.4px] font-normal">
                        {talkPercent}%
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-muted-foreground text-[11.4px] font-normal">Listen</div>
                    <div className="text-foreground text-[11.4px] font-normal">
                        {listenPercent}%
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TalkListenRatio;
