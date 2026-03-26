'use client';
// Call center: summary cards for call history stats (total calls, length, unanswered, etc.).

import { Card, CardContent } from "@/components/ui/card";
import { ArrowDownLeft, PhoneMissed, PhoneCall } from 'lucide-react';

const SummaryCard = ({ count, title, icon, iconBgColor, iconColor }) => {
    return (
        <Card className="bg-card border border-border shadow-sm">
            <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <h1 className="text-xl sm:text-2xl text-card-foreground font-medium">{count}</h1>
                        <p className="text-xs text-muted-foreground">
                            {title}
                        </p>
                    </div>

                    <div
                        className="p-1.5 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: iconBgColor }}
                    >
                        {/* Render icon with inline color */}
                        <div style={{ color: iconColor }}>
                            {icon}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default function CallStatsCards({ stats = {} }) {
    // Dummy stats data matching the source structure
    const defaultStats = {
        totalCalls: 0,
        totalLengthOfCalls: "00:00:00",
        averageLengthOfCalls: "00:00:00",
        maxLengthOfCalls: "00:00:00",
        unansweredCalls: 0,
    };

    const finalStats = { ...defaultStats, ...stats };

    const cardsData = [
        {
            count: finalStats.totalCalls,
            title: "Total Calls",
            icon: <PhoneCall size={24} />,
            iconBgColor: "#0614D830",
            iconColor: "#0B349A",
        },
        {
            count: finalStats.totalLengthOfCalls,
            title: "Total Length of Calls",
            icon: <ArrowDownLeft size={24} />,
            iconBgColor: "#45474630",
            iconColor: "#999999",
        },
        {
            count: finalStats.averageLengthOfCalls,
            title: "Average Length of Calls",
            icon: <ArrowDownLeft size={24} />,
            iconBgColor: "#06D80D30",
            iconColor: "#34C759",
        },
        {
            count: finalStats.maxLengthOfCalls,
            title: "Max Length of Calls",
            icon: <ArrowDownLeft size={24} />,
            iconBgColor: "#066FD830",
            iconColor: "#00BAD1",
        },
        {
            count: finalStats.unansweredCalls,
            title: "Unanswered Calls",
            icon: <PhoneMissed size={24} />,
            iconBgColor: "#F5040466",
            iconColor: "#FF4C51",
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {cardsData.map((item, index) => (
                <SummaryCard key={index} {...item} />
            ))}
        </div>
    );
}
