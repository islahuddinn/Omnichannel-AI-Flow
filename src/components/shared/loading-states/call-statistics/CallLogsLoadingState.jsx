import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function CallLogsLoadingState() {
    return (
        <div className="w-full py-8 px-8 space-y-6">
            {/* Back Button Skeleton */}
            <div className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4 text-muted-foreground opacity-50" />
                <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>
            </div>

            {/* Filter Section Skeleton */}
            <Card className="border border-border">
                <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="h-4 w-16 bg-muted animate-pulse rounded"></div>
                        {[...Array(3)].map((_, i) => (
                            <div
                                key={`dir-${i}`}
                                className="h-8 w-32 bg-muted animate-pulse rounded-full"
                            ></div>
                        ))}
                        <div className="h-4 w-16 bg-muted animate-pulse rounded ml-2"></div>
                        {[...Array(3)].map((_, i) => (
                            <div
                                key={`country-${i}`}
                                className="h-8 w-20 bg-muted animate-pulse rounded-full"
                            ></div>
                        ))}
                        <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
                        {[...Array(5)].map((_, i) => (
                            <div
                                key={`date-${i}`}
                                className="h-8 w-24 bg-muted animate-pulse rounded-full"
                            ></div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Table Skeleton */}
            <Card className="border border-border">
                <CardContent className="p-0">
                    {/* Table Header */}
                    <div className="px-4 py-3 border-b border-border">
                        <div className="h-6 w-48 bg-muted animate-pulse rounded"></div>
                    </div>

                    {/* Table Column Headers */}
                    <div className="grid grid-cols-8 gap-4 px-4 py-3 bg-muted/30">
                        <div className="h-4 w-12 bg-muted animate-pulse rounded"></div>
                        <div className="h-4 w-24 bg-muted animate-pulse rounded"></div>
                        <div className="h-4 w-16 bg-muted animate-pulse rounded"></div>
                        <div className="h-4 w-16 bg-muted animate-pulse rounded"></div>
                        <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
                        <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
                        <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>
                        <div className="h-4 w-12 bg-muted animate-pulse rounded"></div>
                    </div>

                    {/* Table Rows */}
                    {[...Array(8)].map((_, i) => (
                        <div
                            key={i}
                            className="grid grid-cols-8 gap-4 px-4 py-4 border-b border-border"
                        >
                            {/* Call Type & Duration */}
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-muted animate-pulse rounded-full"></div>
                                <div className="space-y-2">
                                    <div className="h-3 w-16 bg-muted animate-pulse rounded"></div>
                                    <div className="h-3 w-12 bg-muted animate-pulse rounded"></div>
                                </div>
                            </div>

                            {/* Contact Number */}
                            <div className="h-4 w-32 bg-muted animate-pulse rounded"></div>

                            {/* Via */}
                            <div className="h-4 w-20 bg-muted animate-pulse rounded"></div>

                            {/* Date */}
                            <div className="space-y-2">
                                <div className="h-3 w-24 bg-muted animate-pulse rounded"></div>
                                <div className="h-3 w-16 bg-muted animate-pulse rounded"></div>
                            </div>

                            {/* Talking Time */}
                            <div className="h-4 w-16 bg-muted animate-pulse rounded"></div>

                            {/* Answer Time */}
                            <div className="h-4 w-12 bg-muted animate-pulse rounded"></div>

                            {/* Status */}
                            <div className="h-4 w-16 bg-muted animate-pulse rounded"></div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-muted animate-pulse rounded-full"></div>
                                <div className="w-8 h-8 bg-muted animate-pulse rounded"></div>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Pagination Skeleton */}
            <div className="flex items-center justify-between">
                <div className="h-10 w-32 bg-muted animate-pulse rounded"></div>
                <div className="flex items-center gap-2">
                    <div className="h-10 w-10 bg-muted animate-pulse rounded"></div>
                    <div className="h-10 w-10 bg-muted animate-pulse rounded"></div>
                    <div className="h-10 w-10 bg-muted animate-pulse rounded"></div>
                    <div className="h-10 w-10 bg-muted animate-pulse rounded"></div>
                </div>
            </div>
        </div>
    );
}
