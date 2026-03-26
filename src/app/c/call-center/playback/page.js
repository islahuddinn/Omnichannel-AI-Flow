"use client";

import { useAudioFiles } from "@/hooks/useAudioFiles";
import AddAudioDialog from "@/components/panels/company-admin/call-center/playback/AddAudioDialog";
import PlaybackTable from "@/components/panels/company-admin/call-center/playback/PlaybackTable";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PlaybackPage() {
    const { data: audioFiles, isLoading, isError, error, refetch } = useAudioFiles();

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-7xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        Playback
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Manage your call center audio files and recordings.
                    </p>
                </div>
                <AddAudioDialog />
            </div>

            {isError ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                        <AlertTriangle className="h-7 w-7 text-destructive" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">Failed to load audio files</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            {error?.message || "Unable to fetch audio files. Please try again."}
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                    </Button>
                </div>
            ) : (
                <PlaybackTable audioFiles={audioFiles} isLoading={isLoading} />
            )}
        </div>
    );
}
