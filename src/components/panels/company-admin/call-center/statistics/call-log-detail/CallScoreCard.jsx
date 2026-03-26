import React from "react";

function CallScoreCard({ score = 67, description, isProcessing = false, isCallAnswered = true }) {
    return (
        <div className="bg-card rounded-[14px] px-4 py-[14px] border border-border shadow-[0px_10px_24px_0px_#0F172A12]">
            <div className="flex items-center gap-2 mb-3 justify-between">
                <h2 className="font-bold text-xs text-foreground">Call Score</h2>
                {isCallAnswered && !isProcessing && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 rounded-full px-[10px] py-[4px]">
                        {score}
                    </span>
                )}
            </div>
            {!isCallAnswered ? (
                <p className="text-[10.3px] font-normal text-muted-foreground leading-relaxed">
                    Call was not answered. Call score is available only for answered calls.
                </p>
            ) : isProcessing ? (
                <p className="text-[10.3px] font-normal text-muted-foreground leading-relaxed">
                    Call score is in progress by AI
                </p>
            ) : (
                <p className="text-[10.3px] font-normal text-muted-foreground leading-relaxed">
                    {description}
                </p>
            )}
        </div>
    );
}

export default CallScoreCard;
