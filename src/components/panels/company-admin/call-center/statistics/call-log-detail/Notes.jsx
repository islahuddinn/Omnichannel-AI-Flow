import React from "react";
import NotesCard from "./NotesCard";
import { Pencil } from "lucide-react";

function Notes({ notes = [], isProcessing = false, isCallAnswered = true }) {
    if (!isCallAnswered) {
        return (
            <div className="space-y-6 w-full bg-card border border-border rounded-[14px] shadow-lg px-[14px] py-[10px]">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-[18px] h-[18px] border border-primary rounded-[5px] flex items-center justify-center">
                        <Pencil className="w-[13px] h-[13px] text-primary" />
                    </div>
                    <h1 className="text-xs font-bold text-foreground">Smart Notes</h1>
                </div>
                <div className="p-4 text-center text-muted-foreground text-xs">
                    Call was not answered. Smart notes are available only for answered calls.
                </div>
            </div>
        );
    }
    if (isProcessing) {
        return (
            <div className="space-y-6 w-full bg-card border border-border rounded-[14px] shadow-lg px-[14px] py-[10px]">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-[18px] h-[18px] border border-primary rounded-[5px] flex items-center justify-center">
                        <Pencil className="w-[13px] h-[13px] text-primary" />
                    </div>
                    <h1 className="text-xs font-bold text-foreground">Smart Notes</h1>
                </div>
                <div className="p-4 text-center text-muted-foreground text-xs">
                    Notes are in progress by AI
                </div>
            </div>
        );
    }

    // If no notes provided, show empty state
    if (!notes || notes.length === 0) {
        return (
            <div className="space-y-6 w-full bg-card border border-border rounded-[14px] shadow-lg px-[14px] py-[10px]">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-[18px] h-[18px] border border-primary rounded-[5px] flex items-center justify-center">
                        <Pencil className="w-[13px] h-[13px] text-primary" />
                    </div>
                    <h1 className="text-xs font-bold text-foreground">Smart Notes</h1>
                </div>
                <div className="p-4 text-center text-muted-foreground text-xs">
                    No notes available for this call.
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full bg-card border border-border rounded-[14px] shadow-lg px-[14px] py-[10px]">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-[18px] h-[18px] border border-primary rounded-[5px] flex items-center justify-center">
                    <Pencil className="w-[13px] h-[13px] text-primary" />
                </div>
                <h1 className="text-xs font-bold text-foreground">Smart Notes</h1>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {notes.map((note, idx) => (
                    <NotesCard key={idx} title={note.title}>
                        <div className="flex flex-col gap-2 items-start text-[11px] text-foreground">
                            <p className="font-normal text-start leading-relaxed">
                                {note.notes}
                            </p>
                            {note.createdBy && (
                                <span className="text-[10px] text-muted-foreground">
                                    Source: {note.createdBy}
                                </span>
                            )}
                        </div>
                    </NotesCard>
                ))}
            </div>
        </div>
    );
}

export default Notes;
