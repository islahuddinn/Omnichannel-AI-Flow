import React from "react";

function SentimentAnalysisCard({ sentiment = "mostly positive", isProcessing = false, isCallAnswered = true }) {
    // Determine sentiment type and styling based on sentiment value
    const getSentimentConfig = (sentimentValue) => {
        const sentimentLower = (sentimentValue || "").toLowerCase();
        
        if (sentimentLower.includes("negative") || sentimentLower.includes("poor") || sentimentLower.includes("bad")) {
            return {
                emoji: "😞", // sad face
                textColor: "text-destructive",
                bgColor: "bg-destructive/10",
            };
        } else if (sentimentLower.includes("neutral")) {
            return {
                emoji: "😐", // neutral face
                textColor: "text-muted-foreground",
                bgColor: "bg-muted",
            };
        } else if (sentimentLower.includes("positive") || sentimentLower.includes("good") || sentimentLower.includes("great")) {
            return {
                emoji: "😊", // happy face
                textColor: "text-emerald-600",
                bgColor: "bg-emerald-500/10",
            };
        } else {
            // Default to neutral if sentiment doesn't match known patterns
            return {
                emoji: "😐",
                textColor: "text-muted-foreground",
                bgColor: "bg-muted",
            };
        }
    };

    const sentimentConfig = getSentimentConfig(sentiment);

    return (
        <div className="bg-card rounded-[14px] px-4 py-[14px] border border-border shadow-[0px_10px_24px_0px_#0F172A12]">
            <h2 className="font-bold text-xs text-foreground mb-3">
                Sentiment Analysis
            </h2>
            {!isCallAnswered ? (
                <div className="text-[10px] text-muted-foreground font-normal px-[10px] py-[6px]">
                    Call was not answered. Sentiment analysis is available only for answered calls.
                </div>
            ) : isProcessing ? (
                <div className="text-[10px] text-muted-foreground font-normal px-[10px] py-[6px]">
                    Overall sentiment is in progress by AI
                </div>
            ) : (
                <div className={`flex items-center gap-2 text-[10px] ${sentimentConfig.textColor} font-normal ${sentimentConfig.bgColor} px-[10px] py-[6px] rounded-full w-fit`}>
                    <span>{sentimentConfig.emoji} Call was {sentiment}</span>
                </div>
            )}
        </div>
    );
}

export default SentimentAnalysisCard;
