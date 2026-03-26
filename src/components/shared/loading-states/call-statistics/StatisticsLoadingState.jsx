import React from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function StatisticsLoadingState() {
    return (
        <div className="w-full py-8 px-8 space-y-6">
            {/* Filter Section Skeleton */}
            <Card className="border border-border">
                <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="h-4 w-16 bg-muted animate-pulse rounded"></div>
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-8 w-32 bg-muted animate-pulse rounded-full"></div>
                        ))}
                        <div className="h-4 w-16 bg-muted animate-pulse rounded ml-2"></div>
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="h-8 w-20 bg-muted animate-pulse rounded-full"></div>
                        ))}
                        <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-8 w-24 bg-muted animate-pulse rounded-full"></div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Statistics Section Skeleton */}
            <div className="space-y-6">
                <div className="h-6 w-32 bg-muted animate-pulse rounded"></div>

                {/* First row of stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {[...Array(5)].map((_, i) => (
                        <Card key={i} className="border border-border">
                            <CardContent className="px-4 py-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="p-3 bg-muted rounded-full w-12 h-12 animate-pulse"></div>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-8 w-20 bg-muted animate-pulse rounded"></div>
                                    <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Second row of stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {[...Array(5)].map((_, i) => (
                        <Card key={i} className="border border-border">
                            <CardContent className="px-4 py-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="p-3 bg-muted rounded-full w-12 h-12 animate-pulse"></div>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-8 w-20 bg-muted animate-pulse rounded"></div>
                                    <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Agent Table Skeleton */}
            <Card className="border border-border">
                <CardContent className="p-4">
                    <div className="h-6 w-24 bg-muted animate-pulse rounded mb-4"></div>
                    <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-muted animate-pulse rounded-full"></div>
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-48 bg-muted animate-pulse rounded"></div>
                                    <div className="h-3 w-32 bg-muted animate-pulse rounded"></div>
                                </div>
                                <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
                                <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
                                <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
