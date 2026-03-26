import React from "react";
import { BarChart3 } from "lucide-react";

export default function StatisticsEmptyState() {
    return (
        <div className="w-full py-16 px-8 flex flex-col items-center justify-center space-y-4">
            <div className="p-4 rounded-full bg-muted">
                <BarChart3 className="w-12 h-12 text-muted-foreground" />
            </div>
            <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                    No Statistics Available
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                    There are no call statistics to display for the selected filters. Try adjusting your filters or check back later.
                </p>
            </div>
        </div>
    );
}
