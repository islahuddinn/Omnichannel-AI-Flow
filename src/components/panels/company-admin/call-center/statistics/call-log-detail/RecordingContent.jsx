import AudioPlayer from "./AudioPlayer";
import TranscriptionList from "./TranscriptionList";

const RecordingContent = ({ recordingLink, transcriptions, sentimentSegments, operatorName, contactName, isProcessing = false, isCallAnswered = true }) => (
    <div className="space-y-6 w-full bg-card border border-border rounded-[14px] shadow-lg px-[14px] py-[10px]">
        <div className="flex items-center justify-between w-full">
            <h4 className="text-xs font-bold text-foreground">Sentiment</h4>
            <div className="flex items-center gap-2">
                <button className="text-[10px] text-muted-foreground font-normal hover:bg-muted/70 border border-border rounded-full px-2 py-1 bg-card">
                    Sentiment
                </button>
                <button className="text-[10px] text-muted-foreground font-normal hover:bg-muted/70 border border-border rounded-full px-2 py-1 bg-card">
                    Topic Extraction
                </button>
                <button className="text-[10px] text-muted-foreground font-normal hover:bg-muted/70 border border-border rounded-full px-2 py-1 bg-card">
                    Call Score
                </button>
            </div>
        </div>
        <AudioPlayer
            audioUrl={recordingLink}
            sentimentSegments={sentimentSegments}
            operatorName={operatorName}
            contactName={contactName}
        />
        <TranscriptionList
            transcriptions={transcriptions}
            isProcessing={isProcessing || !transcriptions?.length}
            isEmpty={transcriptions.length === 0}
            isCallAnswered={isCallAnswered}
        />
    </div>
);

export default RecordingContent;
