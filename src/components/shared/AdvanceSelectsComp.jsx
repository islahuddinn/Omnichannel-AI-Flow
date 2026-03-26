'use client';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useRef, useState, useEffect } from "react";
import { Play, Pause } from "lucide-react";

export function SelectField({
    label,
    options,
    value,
    onChange,
    required = false,
    placeholder = "Select",
    className = "",
    error,
}) {
    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentlyPlaying, setCurrentlyPlaying] = useState(null);

    // Stop audio when value changes
    useEffect(() => {
        if (audioRef.current && isPlaying) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setIsPlaying(false);
            setCurrentlyPlaying(null);
        }
    }, [value]);

    const handlePlay = async (url) => {
        if (audioRef.current) {
            try {
                if (currentlyPlaying === url && isPlaying) {
                    // Pause if same audio is playing
                    audioRef.current.pause();
                    setIsPlaying(false);
                    setCurrentlyPlaying(null);
                    return;
                }

                // Stop current audio if playing
                audioRef.current.pause();
                audioRef.current.currentTime = 0;

                // Set new source
                audioRef.current.src = url;

                // Load and play the audio
                await audioRef.current.load();
                await audioRef.current.play();

                setIsPlaying(true);
                setCurrentlyPlaying(url);
            } catch (error) {
                console.error("Error playing audio:", error);
                setIsPlaying(false);
                setCurrentlyPlaying(null);

                if (error.name === 'NotAllowedError') {
                    alert("Please interact with the page first to enable audio playback");
                }
            }
        }
    };

    // Handle audio end
    const handleAudioEnd = () => {
        setIsPlaying(false);
        setCurrentlyPlaying(null);
    };

    return (
        <div className={`mb-4 space-y-2 ${className}`}>
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                {label}
                {required && <span className="text-destructive ml-1">*</span>}
            </label>

            <div className="relative">
                <Select value={value} onValueChange={onChange}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder={placeholder} />
                    </SelectTrigger>

                    <SelectContent>
                        {options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                    <span>{option.label}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Play button outside the select, positioned absolutely */}
                {typeof value === "string" && value.startsWith("http") && (
                    <button
                        type="button"
                        className="absolute right-10 top-1/2 transform -translate-y-1/2 text-primary hover:text-primary/80 p-1 rounded hover:bg-primary/10 transition-colors z-10"
                        onClick={() => handlePlay(value)}
                        title={currentlyPlaying === value && isPlaying ? "Pause audio" : "Play audio"}
                    >
                        {currentlyPlaying === value && isPlaying ? (
                            <Pause className="h-4 w-4" />
                        ) : (
                            <Play className="h-4 w-4" />
                        )}
                    </button>
                )}

            </div>

            {error && <p className="text-sm font-medium text-destructive mt-1">{error}</p>}

            {/* Audio element */}
            <audio
                ref={audioRef}
                preload="none"
                onEnded={handleAudioEnd}
                onError={(e) => {
                    console.error("Audio error:", e);
                    setIsPlaying(false);
                    setCurrentlyPlaying(null);
                }}
                onPause={() => {
                    setIsPlaying(false);
                    setCurrentlyPlaying(null);
                }}
                className="hidden"
            />
        </div>
    );
}
