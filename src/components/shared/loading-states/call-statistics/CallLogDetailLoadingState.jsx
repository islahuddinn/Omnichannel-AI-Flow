import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function CallLogDetailLoadingState() {
    return (
        <div className="w-full py-8 px-8 space-y-6">
            {/* Back Button Skeleton */}
            <div className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4 text-muted-foreground opacity-50" />
                <div className="h-4 w-40 bg-muted animate-pulse rounded"></div>
            </div>

            {/* Call Info Card Skeleton */}
            <Card className="border border-border">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-start justify-between">
                        <div className="space-y-2">
                            <div className="h-6 w-48 bg-muted animate-pulse rounded"></div>
                            <div className="h-4 w-64 bg-muted animate-pulse rounded"></div>
                        </div>
                        <div className="h-10 w-10 bg-muted animate-pulse rounded-full"></div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 pt-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="space-y-2">
                                <div className="h-3 w-16 bg-muted animate-pulse rounded"></div>
                                <div className="h-4 w-24 bg-muted animate-pulse rounded"></div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Tabs Skeleton */}
            <div className="flex gap-2 border-b border-border">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-10 w-24 bg-muted animate-pulse rounded-t"></div>
                ))}
            </div>

            {/* Content Card Skeleton */}
            <Card className="border border-border">
                <CardContent className="p-6 space-y-4">
                    <div className="h-6 w-32 bg-muted animate-pulse rounded"></div>
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-4 w-full bg-muted animate-pulse rounded"></div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
