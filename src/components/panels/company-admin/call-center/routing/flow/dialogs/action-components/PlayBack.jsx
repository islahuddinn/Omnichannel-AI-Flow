'use client';

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import React, { useEffect, useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { useAudioFiles, useUploadAudio } from "@/hooks/useAudioFiles";
import { Button } from "@/components/ui/button";

function PlayBack({ setAudioId, setFileName, setFileUrl, initialData, errors }) {
    const fileInputRef = useRef(null);
    const [selectedAudio, setSelectedAudio] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");

    // API Hooks
    const { data: audioFilesData, isLoading: isLoadingFiles } = useAudioFiles();
    const uploadMutation = useUploadAudio();

    const audioFiles = audioFilesData || [];

    useEffect(() => {
        if (initialData?.audioId) {
            setSelectedAudio(initialData.audioId);
        }
    }, [initialData]);

    const handleFileChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const result = await uploadMutation.mutateAsync(file);
            // Assuming result.data contains the new file object or the result itself is the file object
            // Adjust based on actual API response of useUploadAudio
            // The hook implementation typically returns response.data
            const newFile = result.data || result;

            const newId = newFile._id || newFile.id;
            const newName = newFile.fileName || newFile.name;
            const newUrl = newFile.fileUrl || newFile.url;

            setAudioId(newId);
            setFileName(newName);
            setFileUrl(newUrl);
            setSelectedAudio(newId.toString());

            toast.success("Audio file uploaded successfully.");

            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = "";

        } catch (error) {
            console.error("Upload failed", error);
            toast.error("Failed to upload audio file.");
        }
    };

    const handleButtonClick = () => {
        fileInputRef.current?.click();
    };

    const handleAudioSelect = (value) => {
        const selectedFile = audioFiles.find((audio) => (audio._id || audio.id).toString() === value.toString());

        if (selectedFile) {
            setAudioId(selectedFile._id || selectedFile.id);
            setFileName(selectedFile.fileName || selectedFile.name);
            setFileUrl(selectedFile.fileUrl || selectedFile.url);
            setSelectedAudio((selectedFile._id || selectedFile.id).toString());
        }
    };

    const filteredAudioFiles = audioFiles.filter((audio) => {
        const name = audio.fileName || audio.name || "";
        return name.toLowerCase().includes(searchTerm.toLowerCase());
    });

    return (
        <ScrollArea className="h-full">
            <div className="flex flex-col gap-3">
                <div>
                    <label className="worksans text-xs text-foreground pb-2">
                        Search Audio
                    </label>
                    <Input
                        placeholder="Search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex flex-col gap-2">
                    <label className="worksans text-xs text-foreground pb-2">
                        Audios
                    </label>
                    <ScrollArea className="h-64 border rounded-md p-2">
                        {isLoadingFiles ? (
                            <div className="flex items-center justify-center h-full text-sm">Loading...</div>
                        ) : filteredAudioFiles.length > 0 ? (
                            <RadioGroup
                                value={selectedAudio ? selectedAudio.toString() : ""}
                                onValueChange={handleAudioSelect}
                                className="flex flex-col gap-3"
                            >
                                {filteredAudioFiles?.map((audio, index) => {
                                    const id = audio._id || audio.id;
                                    const name = audio.fileName || audio.name;
                                    return (
                                        <div key={id} className="flex items-center space-x-2">
                                            <RadioGroupItem value={id.toString()} id={`audio-${index}`} />
                                            <Label htmlFor={`audio-${index}`} className="cursor-pointer">{name}</Label>
                                        </div>
                                    );
                                })}
                            </RadioGroup>
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">No audio files found.</p>
                        )}
                    </ScrollArea>
                    {errors?.audioId && <p className="text-destructive text-[10px] mt-1">{errors.audioId}</p>}
                </div>

                <div>
                    <label className="worksans text-xs text-foreground pb-2 block">
                        Add New Audio
                    </label>
                    <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={handleButtonClick}
                        disabled={uploadMutation.isPending}
                    >
                        {uploadMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload size={20} />}
                        {uploadMutation.isPending ? "Uploading..." : "Upload file"}
                    </Button>

                    {/* Hidden File Input */}
                    <Input
                        type="file"
                        className="hidden"
                        id="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="audio/*"
                    />
                </div>
            </div>
        </ScrollArea>
    );
}

export default PlayBack;
