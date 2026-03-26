"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Headset,
  Users,
  PlayCircle,
  Share2,
  RefreshCw,
  Disc,
  PhoneForwarded,
} from "lucide-react";

// Action Components
import CallToAgent from "./dialogs/action-components/CallToAgent";
import CallToGroup from "./dialogs/action-components/CallToGroup";
import PlayBack from "./dialogs/action-components/PlayBack";
import RedirectToExternal from "./dialogs/action-components/RedirectToExternal";

const callActionDetails = [
  {
    name: "Call To Agent",
    icon: <Headset size={40} />,
    action: "call-to-agent",
    component: CallToAgent,
  },
  {
    name: "Call a Group",
    icon: <Users size={40} />,
    action: "call-to-group",
    component: CallToGroup,
  },
  {
    name: "Play Back",
    icon: <Disc size={40} />,
    action: "playback",
    component: PlayBack,
  },
  {
    name: "Redirect to External Number",
    icon: <PhoneForwarded size={40} />,
    action: "redirect",
    component: RedirectToExternal,
  },
];

export function Node1Modal({ isOpen, onClose, onSave, initialValue = "" }) {
  const [name, setName] = useState(initialValue);

  useEffect(() => {
    setName(initialValue);
  }, [initialValue]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure Call Number</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Call Number Internal Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Sales Line"
            />
          </div>
          <Button onClick={() => onSave(name)}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Node2Modal({
  isOpen,
  onClose,
  onSave,
  initialData,
  nodes = [],
  loopSelection,
  setLoopSelection,
  departmentIds = [],
}) {
  const [agentId, setAgentId] = useState("");
  const [agentName, setAgentName] = useState("");
  const [time, setTime] = useState("");
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupTime, setGroupTime] = useState("");
  const [audioId, setAudioId] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [externalNumName, setExternalNumName] = useState("");
  const [externalNumber, setExternalNumber] = useState("");
  const [externalNumtime, setExternalNumtime] = useState("");

  const [currentAction, setCurrentAction] = useState("All");

  const [tempLoopSelection, setTempLoopSelection] = useState("no");
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (initialData?.agentId) {
      setCurrentAction("call-to-agent");
      setAgentId(initialData.agentId);
      setAgentName(initialData.agentName || "");
      setTime(initialData.time || "");
    } else if (initialData?.groupId) {
      setCurrentAction("call-to-group");
      setGroupId(initialData.groupId);
      setGroupName(initialData.groupName || "");
      setGroupTime(initialData.groupTime || "");
    } else if (initialData?.audioId) {
      setCurrentAction("playback");
      setAudioId(initialData.audioId);
      setFileName(initialData.fileName || "");
      setFileUrl(initialData.fileUrl || "");
    } else if (initialData?.externalNumber) {
      setCurrentAction("redirect");
      setExternalNumber(initialData.externalNumber);
      setExternalNumName(initialData.externalNumName || "");
      setExternalNumtime(initialData.externalNumtime || "");
    } else {
      setCurrentAction("All");
    }

    setTempLoopSelection(loopSelection);
  }, [initialData, loopSelection, isOpen]);

  const isLastCustomNode2 = useMemo(() => {
    if (!initialData || !initialData.id) return true;

    const customNode2s = nodes.filter((node) => node.type === "customNode2");
    if (customNode2s.length === 0) return true;

    const lastNode = customNode2s[customNode2s.length - 1];
    return lastNode.id === initialData.id;
  }, [initialData, nodes]);

  const validateForm = () => {
    const newErrors = {};
    if (currentAction === "call-to-agent") {
      if (!agentId) newErrors.agentId = "Agent required";
      if (!time) newErrors.time = "Time required";
    } else if (currentAction === "call-to-group") {
      if (!groupId) newErrors.groupId = "Group required";
      if (!groupTime) newErrors.groupTime = "Time required";
    } else if (currentAction === "playback") {
      if (!audioId) newErrors.audioId = "Audio required";
    } else if (currentAction === "redirect") {
      if (!externalNumber) newErrors.externalNumber = "Number required";
      if (!externalNumName) newErrors.externalNumName = "Name required";
      if (!externalNumtime) newErrors.externalNumtime = "Time required";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  function handleClose() {
    onClose();
    resetAllFields();
    setCurrentAction("All");
  }

  function handleBack() {
    setCurrentAction("All");
    resetAllFields();
  }

  function resetAllFields() {
    setAgentId("");
    setAgentName("");
    setTime("");
    setGroupId("");
    setGroupName("");
    setGroupTime("");
    setAudioId("");
    setFileName("");
    setFileUrl("");
    setExternalNumber("");
    setExternalNumtime("");
    setExternalNumName("");
    setErrors({});
  }

  function handleSave() {
    if (!validateForm()) return;

    let formattedExternalNumber = externalNumber;
    if (formattedExternalNumber) {
      // Remove + if present
      if (formattedExternalNumber.startsWith("+")) {
        formattedExternalNumber = formattedExternalNumber.substring(1);
      }
      // Add 00 prefix
      formattedExternalNumber = `00${formattedExternalNumber}`;
    }

    const saveData = {
      agentId,
      time,
      agentName,
      groupName,
      groupTime,
      groupId,
      fileName,
      fileUrl,
      audioId,
      externalNumName,
      externalNumber: formattedExternalNumber,
      externalNumtime,
      ...(isLastCustomNode2 && { loopSelection: tempLoopSelection }),
    };

    if (isLastCustomNode2) {
      setLoopSelection(tempLoopSelection);
    }

    onSave(saveData);
    handleClose();
  }

  const ActiveComponent = callActionDetails.find(
    (i) => i.action === currentAction
  )?.component;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent className="p-0 flex flex-col h-full bg-muted overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle
            className="p-3 pt-4 bg-card text-foreground"
            style={{
              width: "100%",
              boxShadow: "0px 2px 3px 0px rgba(0,0,0,0.1)",
            }}
          >
            {currentAction === "All"
              ? "Add New Action"
              : `Action: ${
                  callActionDetails.find(
                    (item) => item.action === currentAction
                  )?.name
                }` || "Unknown"}
          </SheetTitle>
        </SheetHeader>

        {/* Action Selection Grid */}
        {currentAction === "All" && (
          <div className="p-4 gap-4 flex justify-center items-center flex-wrap">
            {callActionDetails.map((item) => (
              <div
                key={item.action}
                className="bg-card h-[90px] w-[90px] hover:bg-accent flex flex-col items-center justify-center gap-2 p-2 rounded-md cursor-pointer transition-all hover:scale-105 border border-border"
                style={{ boxShadow: "0px 2px 4px 0px rgba(0,0,0,0.1)" }}
                onClick={() => setCurrentAction(item.action)}
              >
                <div className="text-foreground">{item.icon}</div>
                <p className="text-[10px] font-medium text-foreground text-center leading-tight">
                  {item.name}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Action Specific Component */}
        {currentAction !== "All" && ActiveComponent && (
          <div className="p-3">
            <ActiveComponent
              agentName={agentName}
              setAgentName={setAgentName}
              agentId={agentId}
              setAgentId={setAgentId}
              time={time}
              setTime={setTime}
              groupName={groupName}
              setGroupName={setGroupName}
              groupId={groupId}
              setGroupId={setGroupId}
              groupTime={groupTime}
              setGroupTime={setGroupTime}
              audioId={audioId}
              setAudioId={setAudioId}
              fileName={fileName}
              setFileName={setFileName}
              fileUrl={fileUrl}
              setFileUrl={setFileUrl}
              externalNumName={externalNumName}
              setExternalNumName={setExternalNumName}
              externalNumber={externalNumber}
              setExternalNumber={setExternalNumber}
              externalNumtime={externalNumtime}
              setExternalNumtime={setExternalNumtime}
              initialData={initialData}
              errors={errors}
              departmentIds={departmentIds}
            />
          </div>
        )}

        {/* Loop Selection Button */}
        {currentAction === "All" && isLastCustomNode2 && (
          <div className="py-3 px-5 flex justify-center">
            <div
              onClick={() => {
                setTempLoopSelection((prev) => (prev === "yes" ? "no" : "yes"));
              }}
              className={`bg-card h-[90px] w-[90px] hover:bg-accent flex flex-col items-center justify-center gap-2 p-2 rounded-md cursor-pointer transition-all hover:scale-105 border border-border`}
              style={{
                boxShadow:
                  tempLoopSelection === "yes"
                    ? "0px 0px 0px 2px hsl(var(--primary))"
                    : "0px 2px 4px 0px rgba(0,0,0,0.1)",
              }}
            >
              <RefreshCw
                className={`h-8 w-8 ${
                  tempLoopSelection === "yes"
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              />
              <p
                className={`text-[10px] font-medium text-center leading-tight ${
                  tempLoopSelection === "yes"
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                Loop
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons - Fixed Width Issue */}
        <div className="p-3 flex justify-center gap-4 w-full mt-auto mb-4">
          {currentAction !== "All" && (
            <Button
              type="button"
              variant="outline"
              className="rounded-[5.53px] flex-1 text-base font-bold bg-muted text-muted-foreground hover:bg-muted/90"
              onClick={handleBack}
            >
              Back
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="rounded-[5.53px] flex-1 text-base font-bold bg-muted text-muted-foreground hover:bg-muted/90"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="rounded-[5.53px] flex-1 text-base font-bold"
            disabled={
              currentAction === "All" && tempLoopSelection === loopSelection
            }
          >
            Ok
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
