"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const AudioPlayer = ({ audioUrl, sentimentSegments = [], operatorName = "Agent", contactName = "Contact" }) => {
    const DUMMY_AUDIO_URL =
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef(null);

    // Reset state when audioUrl changes
    useEffect(() => {
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
    }, [audioUrl]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateTime = () => setCurrentTime(audio.currentTime);
        const updateDuration = () => setDuration(audio.duration);
        const handleEnded = () => setIsPlaying(false);

        audio.addEventListener("timeupdate", updateTime);
        audio.addEventListener("loadedmetadata", updateDuration);
        audio.addEventListener("ended", handleEnded);

        return () => {
            audio.removeEventListener("timeupdate", updateTime);
            audio.removeEventListener("loadedmetadata", updateDuration);
            audio.removeEventListener("ended", handleEnded);
        };
    }, []);

    const togglePlayPause = () => {
        const audio = audioRef.current;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    const skipTime = (seconds) => {
        const audio = audioRef.current;
        audio.currentTime = Math.max(
            0,
            Math.min(audio.currentTime + seconds, duration)
        );
    };

    const handleProgressClick = (e) => {
        const audio = audioRef.current;
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        audio.currentTime = percent * duration;
    };

    const formatTime = (time) => {
        if (isNaN(time)) return "00:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes.toString().padStart(2, "0")}:${seconds
            .toString()
            .padStart(2, "0")}`;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    // Helper to get color based on sentiment label
    const getSentimentColor = (label) => {
        switch (label?.toLowerCase()) {
            case 'positive':
                return '#4ade80'; // green-400
            case 'negative':
                return '#f87171'; // red-400
            case 'neutral':
            default:
                return '#94a3b8'; // slate-400
        }
    };

    // Calculate percentages for the top legend
    const sentimentStats = sentimentSegments.length > 0 ? sentimentSegments.reduce((acc, segment) => {
        const duration = (segment.endSecond - segment.startSecond);
        const label = segment.sentimentLabel?.toLowerCase() || 'neutral';
        acc[label] = (acc[label] || 0) + duration;
        acc.total += duration;
        return acc;
    }, { positive: 0, negative: 0, neutral: 0, total: 0 }) : { positive: 0, negative: 0, neutral: 0, total: 1 };

    const getPercent = (val) => Math.round((val / sentimentStats.total) * 100) || 0;

    return (
        <div className="space-y-4">
            <audio ref={audioRef} src={audioUrl || DUMMY_AUDIO_URL} preload="metadata" />

            {/* Sentiment Legend */}
            <div className="flex justify-end gap-4 text-[10px] items-center">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span className="text-muted-foreground">{getPercent(sentimentStats.positive)}% Positive</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground"></span>
                    <span className="text-muted-foreground">{getPercent(sentimentStats.neutral)}% Neutral</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-destructive"></span>
                    <span className="text-muted-foreground">{getPercent(sentimentStats.negative)}% Negative</span>
                </div>
            </div>

            {/* Progress Bar with Sentiment Timeline */}
            <div
                className="relative h-3 bg-muted rounded-full cursor-pointer group overflow-hidden"
                onClick={handleProgressClick}
            >
                {/* Background Sentiment Segments */}
                {duration > 0 && sentimentSegments.map((segment, idx) => {
                    const startPercent = (segment.startSecond / duration) * 100;
                    const widthPercent = ((segment.endSecond - segment.startSecond) / duration) * 100;

                    return (
                        <div
                            key={idx}
                            className="absolute h-full top-0"
                            style={{
                                left: `${startPercent}%`,
                                width: `${widthPercent}%`,
                                backgroundColor: getSentimentColor(segment.sentimentLabel),
                                opacity: 0.5 // Dim background segments
                            }}
                        />
                    );
                })}

                {/* Active Progress Overlay */}
                { /* We can either show a distinct progress bar on top, or highlight the segments. 
                   The user image shows the bar ITSELF is colored. 
                   So let's just use the segments as the bar, and maybe a marker for current time. 
                   Or we can have the 'played' portion be fully opaque and 'unplayed' be semi-transparent?
                   Let's try a simple white overlay for unplayed to "dim" it, or simpler: just a marker.
                */}

                {/* Current Playhead Marker */}
                <div
                    className="absolute top-0 h-full w-1 bg-foreground z-10 transition-all pointer-events-none"
                    style={{ left: `${progress}%` }}
                />
            </div>

            {/* Time & Operator Info */}
            <div className="flex justify-between items-start text-[11px] text-muted-foreground mt-1">
                <div className="flex gap-4">
                    {/* Check user image: NL . New Lead   MS . Monika S Junior */}
                    <span className="font-medium text-foreground">NL · {contactName}</span>
                    <span className="font-medium text-foreground">MS · {operatorName}</span>
                </div>
                <span>
                    {formatTime(currentTime)} / {formatTime(duration)} · 1x
                </span>
            </div>


            {/* Controls */}
            <div className="flex items-center justify-center gap-4 mt-2">
                <button
                    onClick={() => skipTime(-10)}
                    className="p-2 rounded-full hover:bg-accent transition-colors"
                    aria-label="Skip backward 10 seconds"
                >
                    <SkipBack className="w-5 h-5 text-muted-foreground" />
                </button>

                <button
                    onClick={togglePlayPause}
                    className="p-4 rounded-full bg-primary hover:bg-primary/90 shadow-xl"
                    aria-label={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ? (
                        <Pause className="w-6 h-6 text-primary-foreground" fill="currentColor" />
                    ) : (
                        <Play className="w-6 h-6 text-primary-foreground" fill="currentColor" />
                    )}
                </button>

                <button
                    onClick={() => skipTime(10)}
                    className="p-2 rounded-full hover:bg-accent transition-colors"
                    aria-label="Skip forward 10 seconds"
                >
                    <SkipForward className="w-5 h-5 text-muted-foreground" />
                </button>
            </div>
        </div>
    );
};

export default AudioPlayer;
