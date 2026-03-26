"use client";

import { useState, useRef } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Loader2, Pencil, Trash } from "lucide-react";
import { format } from "date-fns";
import { useDeleteAudio } from "@/hooks/useAudioFiles";
import { toast } from "react-hot-toast";
import AddAudioDialog from "./AddAudioDialog";
import ConfirmDialog from "@/components/modals/ConfirmDialog";

export default function PlaybackTable({ audioFiles = [], isLoading }) {
    const [playingId, setPlayingId] = useState(null);
    const [editingFile, setEditingFile] = useState(null);
    const [itemToDelete, setItemToDelete] = useState(null);
    const audioRef = useRef(new Audio());

    const deleteMutation = useDeleteAudio();

    const handlePlay = (fileUrl, id) => {
        if (playingId === id) {
            // Pause
            audioRef.current.pause();
            setPlayingId(null);
        } else {
            // Play new
            if (playingId) {
                audioRef.current.pause();
            }
            audioRef.current.src = fileUrl;
            audioRef.current.play().catch((e) => console.error("Play error:", e));
            setPlayingId(id);

            audioRef.current.onended = () => setPlayingId(null);
        }
    };

    const handleDeleteClick = (id) => {
        setItemToDelete(id);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;

        try {
            await deleteMutation.mutateAsync(itemToDelete);
            toast.success("Audio deleted successfully");
            if (playingId === itemToDelete) {
                audioRef.current.pause();
                setPlayingId(null);
            }
            setItemToDelete(null);
        } catch (error) {
            console.error("Delete failed", error);
            toast.error("Failed to delete audio");
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading audio files...
            </div>
        );
    }

    if (audioFiles.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center border rounded-md bg-card">
                <p className="text-lg font-medium text-foreground">No audio files found</p>
                <p className="text-sm text-muted-foreground">
                    Upload an audio file to get started.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-md border bg-card">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                        <TableHead className="w-[50px]">#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Default</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {audioFiles.map((file, index) => (
                        <TableRow key={file._id}>
                            <TableCell className="font-medium">{index + 1}</TableCell>
                            <TableCell>
                                <div
                                    className="max-w-[300px] truncate"
                                    title={file.fileName}
                                >
                                    {file.fileName}
                                </div>
                            </TableCell>
                            <TableCell>
                                {file.isDefault ? (
                                    <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Yes</Badge>
                                ) : (
                                    <Badge variant="outline" className="text-muted-foreground">No</Badge>
                                )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {file.createdAt ? format(new Date(file.createdAt), "MMM dd, yyyy") : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handlePlay(file.fileUrl, file._id)}
                                        className="hover:bg-accent hover:text-accent-foreground"
                                    >
                                        {playingId === file._id ? (
                                            <Pause className="w-4 h-4 fill-current" />
                                        ) : (
                                            <Play className="w-4 h-4 fill-current" />
                                        )}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setEditingFile(file)}
                                        className="hover:bg-primary/10 hover:text-primary"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDeleteClick(file._id)}
                                        disabled={deleteMutation.isPending}
                                        className="hover:bg-destructive/10 hover:text-destructive"
                                    >
                                        {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash className="w-4 h-4" />}
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {/* Edit Dialog - Rendered conditionally when a file is selected for editing */}
            {editingFile && (
                <AddAudioDialog
                    initialData={editingFile}
                    onClose={() => setEditingFile(null)}
                />
            )}

            <ConfirmDialog
                open={!!itemToDelete}
                onOpenChange={(open) => !open && setItemToDelete(null)}
                title="Delete Audio File"
                description="Are you sure you want to delete this audio file? This action cannot be undone."
                onConfirm={confirmDelete}
                loading={deleteMutation.isPending}
                variant="destructive"
                confirmText="Delete"
            />
        </div>
    );
}
