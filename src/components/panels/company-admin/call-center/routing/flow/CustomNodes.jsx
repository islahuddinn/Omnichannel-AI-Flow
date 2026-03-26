"use client";

import { Handle, Position } from "reactflow";
import {
  Settings,
  Trash2,
  PhoneForwarded,
  Play,
  Pause,
  Headset,
  Users,
  Disc,
  CirclePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Helper for Country Flag (simplified)
const getFlagUrl = (phoneNumber) => {
  if (!phoneNumber) return "https://flagcdn.com/w40/us.png"; // Default to US if no number

  // Remove all non-digit characters
  let n = phoneNumber.replace(/\D/g, "");
  
  // Remove leading "00" (international prefix)
  if (n.startsWith("00")) {
    n = n.substring(2);
  }
  // Remove leading "+" equivalent (already removed by \D, but handle if present)
  // Remove leading "1" if it's just a single digit (US/Canada)
  
  let code = "us"; // Default

  // Match country codes (check longer codes first to avoid false matches)
  if (n.startsWith("971")) code = "ae"; // UAE
  else if (n.startsWith("966")) code = "sa"; // Saudi Arabia
  else if (n.startsWith("421")) code = "sk"; // Slovakia
  else if (n.startsWith("420")) code = "cz"; // Czech Republic
  else if (n.startsWith("44")) code = "gb"; // UK
  else if (n.startsWith("91")) code = "in"; // India
  else if (n.startsWith("49")) code = "de"; // Germany
  else if (n.startsWith("33")) code = "fr"; // France
  else if (n.startsWith("34")) code = "es"; // Spain
  else if (n.startsWith("39")) code = "it"; // Italy
  else if (n.startsWith("86")) code = "cn"; // China
  else if (n.startsWith("81")) code = "jp"; // Japan
  else if (n.startsWith("61")) code = "au"; // Australia
  else if (n.startsWith("92")) code = "pk"; // Pakistan
  else if (n.startsWith("1")) code = "us"; // US/Canada (check last to avoid false matches)

  return `https://flagcdn.com/w40/${code}.png`;
};

// --- CustomNode1: Start Node ---
export function CustomNode1({ data }) {
  const flagUrl = getFlagUrl(data.phoneNumber);

  return (
    <div className="relative flex items-center border border-border rounded-md p-3 gap-5 bg-card w-fit min-w-[200px]">
      <img src={flagUrl} alt="flag" className="w-7 h-5 rounded-[2px]" />
      <p className="text-sm font-medium text-foreground">{data.label || "Start Flow"}</p>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 ml-auto text-muted-foreground hover:text-foreground"
        onClick={data.onSettingsClick}
      >
        <Settings className="h-4 w-4" />
      </Button>
      <div
        className="bg-card z-10 absolute right-[-10px] top-[50%] transform -translate-y-1/2 cursor-pointer rounded-full"
        onClick={data.onAddClick}
      >
        <CirclePlus
          className="text-muted-foreground hover:text-foreground"
          size={20}
        />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// --- CustomNode2: Action Node ---
export function CustomNode2({ data, id }) {
  const isAgentData = !!data.agentId;
  const isGroupData = !!data.groupId;
  const isAudioData = !!data.audioId;
  const isExternalNumData = !!data.externalNumber;

  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleSettingsClick = () => {
    if (data.onSettingsClick) {
      data.onSettingsClick(); // Invokes parent handler
    }
  };

  const handlePlayPause = (e) => {
    e.stopPropagation();
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleDeleteClick = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (data.onDeleteClick) {
      data.onDeleteClick(id);
    }
    setIsDeleteDialogOpen(false);
  };

  return (
    <>
      <div className="flex flex-col border border-border rounded-md bg-card min-w-[200px]">
        <div className="flex items-center justify-between gap-2 border-b border-border p-2">
          <div className="text-foreground">
            {isAgentData ? (
              <Headset size={20} />
            ) : isGroupData ? (
              <Users size={20} />
            ) : isAudioData ? (
              <Disc className="w-5 h-5" />
            ) : isExternalNumData ? (
              <PhoneForwarded className="w-5 h-5" />
            ) : null}
          </div>

          <div className="flex-1 px-2">
            <p className="text-xs font-semibold text-foreground">
              {isAgentData
                ? "Call to Agent"
                : isGroupData
                  ? "Call to Group"
                  : isAudioData
                    ? "Play Back"
                    : isExternalNumData
                      ? "External Transfer"
                      : "Action"}
            </p>
            <p className="text-[10px] font-medium text-muted-foreground">
              {isAgentData
                ? `ID:${data.agentId}`
                : isGroupData
                  ? `ID:${data.groupId}`
                  : isAudioData
                    ? `ID:${data.audioId}`
                    : isExternalNumData
                      ? `Name:${data.externalNumName}`
                      : null}
            </p>
          </div>
          <Settings
            onClick={handleSettingsClick}
            className="cursor-pointer text-muted-foreground hover:text-foreground w-4 h-4"
          />
          <Trash2
            className="cursor-pointer text-muted-foreground hover:text-destructive"
            size={16}
            onClick={handleDeleteClick}
          />
        </div>

        {/* Content Body */}
        <div>
          {isAgentData ? (
            <p className="p-2 font-semibold text-xs text-center border-t-0 text-foreground">
              {data.agentName} ({data.time}s)
            </p>
          ) : isGroupData ? (
            <p className="p-2 font-semibold text-xs text-center border-t-0 text-foreground">
              {data.groupName} ({data.groupTime}s)
            </p>
          ) : isAudioData ? (
            <p className="p-2 font-semibold text-xs flex items-center justify-center gap-2 border-t-0 text-foreground">
              <span className="truncate max-w-[12ch]">{data.fileName}</span>
              <button
                onClick={handlePlayPause}
                className="cursor-pointer p-1 hover:bg-accent rounded text-foreground"
              >
                {isPlaying ? (
                  <Pause className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
              </button>
              <audio
                ref={audioRef}
                src={data.fileUrl}
                onEnded={() => setIsPlaying(false)}
              />
            </p>
          ) : isExternalNumData ? (
            <p className="p-2 font-semibold text-xs flex items-center justify-between border-t-0 text-foreground">
              {data.externalNumber} <span>({data.externalNumtime}s)</span>
            </p>
          ) : null}
        </div>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Node</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this node? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- TerminalNode: Logic Node (Answer / No Answer) ---
export function TerminalNode({ data }) {
  return (
    <div
      className={`relative rounded-full w-[120px] py-1 text-center text-[10px] text-white ${data.isAnswer ? "bg-emerald-500" : "bg-destructive"
        }`}
    >
      <div className="text-xs font-medium">{data.label}</div>

      <div
        className="bg-card z-10 absolute right-[-10px] top-[50%] transform -translate-y-1/2 cursor-pointer rounded-full"
        onClick={data.onPlusClick}
      >
        <CirclePlus
          className="text-muted-foreground hover:text-foreground"
          size={20}
        />
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
