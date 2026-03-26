"use client";
import React from 'react';
import CallStatusTabs from '@/components/call-center/CallStatusTabs';
import { useCallStore } from '@/store/callStore';
import { Button } from '@/components/ui/button';

export default function TestCallStatusPage() {
    const { addCompletedCall, activeCalls, updateActiveCalls } = useCallStore();

    const handleSimulateIncoming = () => {
        updateActiveCalls([
            ...activeCalls,
            {
                id: `active-${Date.now()}`,
                phoneNumber: '+15550009999',
                status: 'Ringing...',
                direction: 'incoming',
                duration: 0,
                isOnHold: false,
            }
        ]);
    };

    const handleSimulateCallEnd = () => {
        addCompletedCall({
            id: `completed-${Date.now()}`,
            phoneNumber: '+15550009999',
            status: 'Incoming Completed',
            direction: 'incoming',
            duration: 45,
            time: new Date().toLocaleTimeString()
        });
    };

    return (
        <div className="p-10 space-y-8 bg-slate-50 min-h-screen">
            <h1 className="text-2xl font-bold text-slate-800">CallStatusTabs Port Verification</h1>

            <div className="p-4 bg-white rounded-lg shadow border border-slate-200">
                <h2 className="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">Component Preview</h2>
                {/* Render the ported component */}
                <CallStatusTabs />
            </div>

            <div className="flex gap-4">
                <Button onClick={handleSimulateIncoming}>Simulate Incoming Call</Button>
                <Button variant="destructive" onClick={handleSimulateCallEnd}>Simulate Call End</Button>
            </div>

            <div className="text-sm text-slate-500">
                <p>This page renders `CallStatusTabs` connected to the Zustand store with static data.</p>
                <p>Check the list above. You should see:</p>
                <ul className="list-disc ml-5 mt-2">
                    <li>1 Active Incoming Call (Ringing)</li>
                    <li>1 Active Outgoing Call (Connected)</li>
                    <li>2 Completed Calls</li>
                </ul>
            </div>
        </div>
    );
}
