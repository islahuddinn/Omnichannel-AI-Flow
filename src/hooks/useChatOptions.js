import { useQuery } from "@tanstack/react-query";
import axios from "axios";

// Helper hook to fetch audio files
export const useAudioFiles = () => {
    return useQuery({
        queryKey: ["audio-files"],
        queryFn: async () => {
            // Replace with actual API endpoint when available
            // For now, return empty or mock data to prevent errors
            try {
                const response = await axios.get("/api/audio-files");
                return response.data;
            } catch (error) {
                console.warn("Audio files API not found, using empty list");
                return [];
            }
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
};

export const usePlaybackDuringPausedOptions = () => {
    const { data: audioFiles = [] } = useAudioFiles();

    // Find the default file
    const defaultFile = Array.isArray(audioFiles) ? audioFiles.find((file) => file.is_default === true) : null;

    const options = [];

    if (defaultFile) {
        options.push({
            value: defaultFile.fileUrl,
            label: "Default (Company Level)",
        });
    }

    options.push({
        value: "choose",
        label: "Choose (Upload/Select)",
    });

    // Add a dummy playable option for testing as requested
    options.push({
        value: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        label: "Test Audio (Dummy)",
    });

    return options;
};

export const useDefaultAudioUrl = () => {
    const { data: audioFiles = [] } = useAudioFiles();

    if (!Array.isArray(audioFiles)) return "";

    const defaultFile = audioFiles.find((file) => file.is_default === true);
    return defaultFile ? defaultFile.fileUrl : "";
};

export const useSpecificPlaybackOptions = () => {
    const { data: audioFiles = [] } = useAudioFiles();

    if (!Array.isArray(audioFiles)) return [];

    return audioFiles.map((file) => ({
        value: file.fileUrl,
        label: file.fileName,
    }));
};
