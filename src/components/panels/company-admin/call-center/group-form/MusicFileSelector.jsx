'use client';

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Upload, File, Play, Pause } from "lucide-react";
import { toast } from "sonner";

// Dummy Audio Files
const MusicFileSelector = ({ value, onChange, waitingOption = "no", audioFiles = [], uploadMutation }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentAudio, setCurrentAudio] = useState(null);
    const fileInputRef = useRef(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadLoading, setUploadLoading] = useState(false);

    // Use passed audio files
    const availableFiles = audioFiles;

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const getSelectedFileId = () => {
        if (!value?.fileId) return "";
        return value.fileId.toString();
    };

    const getMatchedFileName = () => {
        if (!value?.fileId) return "";
        // Match by id or _id
        const file = availableFiles.find(f => (f.id || f._id || "").toString() === value.fileId.toString());
        return file ? (file.fileName || file.name) : "";
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            if (!['audio/wav', 'audio/mp3', 'audio/mpeg'].includes(file.type)) {
                toast.error("WAV or MP3 only");
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile || !uploadMutation) return;

        try {
            // The useUploadAudio hook already constructs the FormData
            const response = await uploadMutation.mutateAsync(selectedFile);
            // API returns { success, message, data: { _id, fileName, fileUrl, ... } }
            const newFile = response?.data ?? response;

            if (newFile?._id) {
                onChange({
                    fileId: newFile._id,
                    fileUrl: newFile.fileUrl ?? newFile.url,
                    fileName: newFile.fileName ?? newFile.name
                });
                setSelectedFile(null);
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
                toast.success("File uploaded successfully");
            }
        } catch (error) {
            console.error("Upload failed", error);
            toast.error("File upload failed");
        }
    };

    const handlePreviewAudio = (audioUrl) => {
        if (currentAudio) {
            currentAudio.pause();
            setCurrentAudio(null);
            setIsPlaying(false);
        } else {
            if (!audioUrl) return;
            try {
                const audio = new Audio(audioUrl);
                audio.play().then(() => {
                    setIsPlaying(true);
                    setCurrentAudio(audio);
                    audio.onended = () => {
                        setIsPlaying(false);
                        setCurrentAudio(null);
                    };
                }).catch(e => {
                    console.error("Audio play failed", e);
                    toast.error("Could not play audio");
                });
            } catch (e) {
                console.error("Audio error", e);
            }
        }
    };

    const handleFileSelection = (fileId) => {
        const file = availableFiles.find(f => (f.id || f._id || "").toString() === fileId);
        if (file) {
            onChange({
                fileId: file.id || file._id,
                fileUrl: file.fileUrl || file.url, // Handle different API response structures
                fileName: file.fileName || file.name
            });
        }
    };

    const getWaitingOptionLabel = () => {
        switch (waitingOption) {
            case "wait": return "Music for 'Wait in Line' option";
            case "callback": return "Music for 'Hold or Callback' option";
            default: return "";
        }
    };

    const isDisabled = waitingOption === "no";

    return (
        <div className="space-y-4">
            <div>
                <label className="worksans text-xs text-foreground block mb-2">
                    {getWaitingOptionLabel()}
                </label>

                {!isDisabled && (
                    <>
                        <Select
                            onValueChange={handleFileSelection}
                            value={getSelectedFileId()}
                        >
                            <SelectTrigger className="w-full bg-muted border-border">
                                <SelectValue placeholder={availableFiles.length === 0 ? "No audio files available" : "Select an audio file"} />
                            </SelectTrigger>
                            <SelectContent>
                                {availableFiles.map((file) => {
                                    const id = file.id || file._id;
                                    const name = file.fileName || file.name;
                                    return (
                                        <SelectItem key={id} value={id.toString()}>
                                            <span className="truncate max-w-[200px]">{name}</span>
                                        </SelectItem>
                                    );
                                })}
                                {availableFiles.length === 0 && <SelectItem value="none" disabled>No audio files found</SelectItem>}
                            </SelectContent>
                        </Select>

                        {value?.fileId && (
                            <div className="mt-2 p-2 bg-muted rounded-md flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <File className="h-4 w-4" />
                                    <span className="text-sm text-foreground">{getMatchedFileName() || value.fileName}</span>
                                </div>
                                <Button type="button" variant="ghost" size="sm" onClick={() => handlePreviewAudio(value.fileUrl)}>
                                    {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                                </Button>
                            </div>
                        )}

                        <div className="mt-4 flex items-center justify-center">
                            <div className="border-t border-border flex-grow"></div>
                            <span className="mx-3 text-muted-foreground text-sm font-medium">OR</span>
                            <div className="border-t border-border flex-grow"></div>
                        </div>

                        <div className="mt-4 p-4 cursor-pointer border-2 border-dashed border-border rounded-lg text-center"
                            onClick={triggerFileInput}
                        >
                            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground mb-2">Upload a new audio file</p>
                            <Input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                accept=".wav,.mp3"
                                onChange={handleFileSelect}
                            />
                            {selectedFile && <p className="text-sm text-primary mb-2">{selectedFile.name}</p>}
                            <Button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleUpload(); }}
                                disabled={!selectedFile || (uploadMutation && uploadMutation.isPending)}
                                className="w-full mt-2"
                            >
                                {(uploadMutation && uploadMutation.isPending) ? "Uploading..." : "Upload File"}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default MusicFileSelector;
