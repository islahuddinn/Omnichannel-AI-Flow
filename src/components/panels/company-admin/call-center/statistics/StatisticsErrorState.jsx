import React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StatisticsErrorState({ error, onRetry }) {
    return (
        <div className="w-full py-16 px-8 flex flex-col items-center justify-center space-y-4">
            <div className="p-4 rounded-full bg-destructive/10">
                <AlertCircle className="w-12 h-12 text-destructive" />
            </div>
            <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                    Error Loading Statistics
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                    {error?.message || "Something went wrong while loading the call statistics. Please try again."}
                </p>
            </div>
            {onRetry && (
                <Button onClick={onRetry} variant="outline">
                    Try Again
                </Button>
            )}
        </div>
    );
}
