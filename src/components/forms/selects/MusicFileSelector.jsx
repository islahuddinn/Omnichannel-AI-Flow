import React, { useState, useRef, memo, useEffect } from "react";
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

// Mock or real fetch hook - in a real app this would come from a service
// We will accept audioFiles as a prop or fetch them here.
// For now, we'll assume audioFiles are passed or we mock them if not provided.

const MusicFileSelector = memo(({ value, onChange, waitingOption = "no", audioFiles = [], isLoading = false, onUpload }) => {
    // value is expected to be { fileId, fileUrl, fileName } or just the url string depending on usage.
    // Based on UserForm usage, it seems we might handle just the URL or an object. 
    // The reference UserForm uses key `playback` which is a string URL, but `MusicFileSelector` returns an object.

    const [selectedFile, setSelectedFile] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentAudio, setCurrentAudio] = useState(null);
    const fileInputRef = useRef(null);
    // const { toast } = useToast();

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const getSelectedFileId = () => {
        // value could be an object or a string (url)
        const fileUrl = typeof value === 'object' ? value?.fileUrl : value;

        if (!fileUrl || !audioFiles) return "";

        const matchingFile = audioFiles.find(
            file => file.fileUrl === fileUrl
        );

        return matchingFile ? matchingFile.id.toString() : "";
    };

    const getMatchedFileName = () => {
        const fileUrl = typeof value === 'object' ? value?.fileUrl : value;
        if (!fileUrl || !audioFiles) return "";

        const matchingFile = audioFiles.find(
            file => file.fileUrl === fileUrl
        );

        return matchingFile ? matchingFile.fileName : (typeof value === 'object' ? value.fileName : "Selected Audio");
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg'];
            if (!allowedTypes.includes(file.type)) {
                // toast({
                //     title: "Invalid File Type",
                //     description: "Please select a WAV or MP3 file",
                //     variant: "destructive",
                // });
                return;
            }

            const maxSize = 10 * 1024 * 1024; // 10MB
            if (file.size > maxSize) {
                // toast({
                //     title: "File Too Large",
                //     description: "Please select a file smaller than 10MB",
                //     variant: "destructive",
                // });
                return;
            }

            setSelectedFile(file);
        }
    };

    const handleUploadClick = async () => {
        if (!selectedFile || !onUpload) return;

        // onUpload should be a promise that returns the new file object
        try {
            const newFile = await onUpload(selectedFile);
            if (newFile) {
                onChange({
                    fileId: newFile.id,
                    fileUrl: newFile.fileUrl,
                    fileName: newFile.fileName,
                });
                setSelectedFile(null);
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        } catch (error) {
            console.error("Upload failed", error);
        }
    };

    const handlePreviewAudio = (audioUrl) => {
        if (currentAudio) {
            currentAudio.pause();
            setCurrentAudio(null);
            setIsPlaying(false);
        }

        if (!isPlaying && audioUrl) {
            const audio = new Audio(audioUrl);
            audio.play().catch(e => console.error("Error playing audio:", e));
            setCurrentAudio(audio);
            setIsPlaying(true);

            audio.onended = () => {
                setIsPlaying(false);
                setCurrentAudio(null);
            };
        }
    };

    const stopAudio = () => {
        if (currentAudio) {
            currentAudio.pause();
            setCurrentAudio(null);
            setIsPlaying(false);
        }
    };

    const handleFileSelection = (fileId) => {
        stopAudio();
        const selectedAudioFile = audioFiles.find(file => file.id === parseInt(fileId));
        if (selectedAudioFile) {
            onChange({
                fileId: selectedAudioFile.id,
                fileUrl: selectedAudioFile.fileUrl,
                fileName: selectedAudioFile.fileName,
            });
        }
    };

    const getWaitingOptionLabel = () => {
        switch (waitingOption) {
            case "wait":
                return "Music for 'Wait in Line' option";
            case "callback":
                return "Music for 'Hold or Callback' option";
            case "employee_playback":
                return "Choose Specific Playback*";
            default:
                return "";
        }
    };

    const isDisabled = waitingOption === "no";
    const fileUrl = typeof value === 'object' ? value?.fileUrl : value;

    return (
        <div className="space-y-4">
            <div>
                <label className="text-xs text-[#2F2B3DE5] block mb-2 font-medium">
                    {getWaitingOptionLabel()}
                </label>

                {!isDisabled && (
                    <>
                        <Select
                            onValueChange={handleFileSelection}
                            value={getSelectedFileId()}
                            disabled={isLoading || audioFiles.length === 0}
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue
                                    placeholder={
                                        isLoading
                                            ? "Loading options..."
                                            : audioFiles.length === 0
                                                ? "No audio files available"
                                                : "Select an audio file"
                                    }
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {audioFiles.map((file) => (
                                    <SelectItem key={file.id} value={file.id.toString()}>
                                        <div className="flex items-center justify-between w-full">
                                            <span className="truncate max-w-[200px]">{file.fileName}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {fileUrl && (
                            <div className="mt-2 p-2 bg-gray-50 rounded-md">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <File className="h-4 w-4" />
                                        <span className="text-sm text-gray-700">{getMatchedFileName()}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handlePreviewAudio(fileUrl)}
                                            className="p-1 h-auto"
                                        >
                                            {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {fileUrl && (
                            <div className="mt-2 flex items-center justify-center">
                                <div className="border-t border-gray-300 flex-grow"></div>
                                <span className="mx-3 text-gray-500 text-sm font-medium">OR</span>
                                <div className="border-t border-gray-300 flex-grow"></div>
                            </div>
                        )}

                        <div className="mt-4 p-4 cursor-pointer border-2 border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            onClick={triggerFileInput}
                        >
                            <div className="text-center">
                                <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                                <p className="text-sm text-gray-600 mb-2">Upload a new audio file</p>
                                <p className="text-xs text-gray-500 mb-3">Supported formats: WAV, MP3 (Max 10MB)</p>

                                <Input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".wav,.mp3,audio/wav,audio/mp3,audio/mpeg"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />

                                {selectedFile && (
                                    <div className="text-sm text-gray-700 mb-3 bg-white p-2 border rounded">
                                        Selected: {selectedFile.name}
                                    </div>
                                )}

                                <Button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleUploadClick();
                                    }}
                                    disabled={!selectedFile || isLoading}
                                    className="w-full"
                                >
                                    {isLoading ? (
                                        "Uploading..."
                                    ) : (
                                        "Upload File"
                                    )}
                                </Button>
                            </div>
                        </div>
                    </>
                )}

                {isDisabled && (
                    <div className="p-4 bg-gray-100 rounded-md text-center">
                        <p className="text-sm text-gray-500">
                            Music selection is not available when "Incoming Calls Waiting Options" is set to "No"
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
});

MusicFileSelector.displayName = "MusicFileSelector";
export default MusicFileSelector;
