"use client";

import { useFormContext, Controller } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Play, Pause, Upload, FileAudio, Phone } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import {
  callCenterFeatureOptions,
  yesNoOptions,
  roleInCallCenterOptions,
  callsAccessOptions,
  recordingsDownloadOptions,
  waitingInLineOptions,
  playbackDuringPausedOptions,
} from "../formOptions";

export default function CallSettingsTab({
  phoneNumbers = [],
  audioFiles = [],
  uploadMutation,
}) {
  const {
    control,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext();
  const [isDragOver, setIsDragOver] = useState(false);

  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const callCenterValue = watch("call_center");
  const inboundCallsValue = watch("inbound_calls");
  const outboundCallsValue = watch("outbound_calls");
  const playbackDuringPausedValue = watch("playback_during_paused");
  const selectedOutboundNumbers = watch("outbound_phone_number");
  const playbackValue = watch("playback");
  const specificPlaybackValue = watch("specific_playback_selection");

  // Find the Default Audio File from the list
  const defaultAudio = audioFiles.find((f) => f.isDefault || f.is_default);

  // Effect: Smart Selection Logic
  useEffect(() => {
    // If "default" is selected but no default audio exists, switch to "choose"
    if (
      playbackDuringPausedValue === "default" &&
      !defaultAudio &&
      audioFiles.length > 0
    ) {
      // Only force switch if we have audio files but none are default.
      // If audioFiles is empty, maybe we still leave it or force choose?
      // User requirement: "if there no isDefault audio file true than select choose"
      setValue("playback_during_paused", "choose");
    }

    // Optional: If we want to auto-select "default" when one exists and nothing is set?
    // The defaultValues in UserForm set it to "default" initially.
  }, [playbackDuringPausedValue, defaultAudio, audioFiles, setValue]);

  // Effect: Clear fields if default is selected
  useEffect(() => {
    if (playbackDuringPausedValue === "default") {
      setValue("playback", "default"); // Reset to default marker
      setValue("specific_playback_selection", "");
    }
  }, [playbackDuringPausedValue, setValue]);

  // Effect: Handle Audio Player cleanup
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Effect: Turn Call Center OFF if both Inbound and Outbound are NO
  useEffect(() => {
    if (
      inboundCallsValue === "no" &&
      outboundCallsValue === "no" &&
      callCenterValue === "on"
    ) {
      setValue("call_center", "off");
    }
  }, [inboundCallsValue, outboundCallsValue, callCenterValue, setValue]);

  // Effect: Clear outbound phone numbers if no phone numbers are available
  useEffect(() => {
    if (phoneNumbers.length === 0) {
      setValue("outbound_phone_number", []);
      setValue("primary_outbound_phone_number", "");
    }
  }, [phoneNumbers.length, setValue]);

  // --- Audio Handlers ---
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file) => {
    try {
      const result = await uploadMutation.mutateAsync(file);
      // API returns { success, message, data: { _id, fileName, fileUrl } }; Select uses fileUrl as value
      const fileObj = result?.data ?? result;
      const fileUrl = fileObj?.fileUrl ?? fileObj?.url;

      if (fileUrl) {
        // Defer to next tick so optimistic cache update flushes and dropdown options include the new file
        setTimeout(() => {
          setValue("playback", fileUrl);
          setValue("specific_playback_selection", fileUrl);
        }, 0);
      }
    } catch (error) {
      console.error("Upload failed", error);
    }
  };

  const togglePlay = (url) => {
    if (!url) return;

    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
        setIsPlaying(true);
      } else {
        const audio = new Audio(url);
        audio.onended = () => setIsPlaying(false);
        audioRef.current = audio;
        audio.play();
        setIsPlaying(true);
      }
    }
  };

  const fieldVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: (i) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.05, duration: 0.3 },
    }),
  };

  return (
    <motion.div
      variants={fieldVariants}
      custom={0}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <div className="space-y-2 w-full">
        <Label>Call Center Feature *</Label>
        <Controller
          name="call_center"
          control={control}
          render={({ field }) => (
            <Select
              onValueChange={(val) => {
                field.onChange(val);
                // If toggling ON, force defaults immediately to prevent Auto-Off logic from firing
                if (val === "on") {
                  const currentIn = getValues("inbound_calls");
                  const currentOut = getValues("outbound_calls");

                  if (currentIn !== "yes")
                    setValue("inbound_calls", "yes", { shouldValidate: true });
                  if (currentOut !== "yes")
                    setValue("outbound_calls", "yes", { shouldValidate: true });
                }
              }}
              value={field.value}
            >
              <SelectTrigger className="w-full bg-white dark:bg-background">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {callCenterFeatureOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {callCenterValue === "on" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6 border-l-2 border-blue-200 pl-6 mt-6 dark:border-blue-900"
        >
          <div className="grid grid-cols-2 gap-6 p-4 bg-slate-50 dark:bg-slate-900 rounded-md">
            <div className="space-y-2">
              <Label>Inbound Calls</Label>
              <Controller
                name="inbound_calls"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full bg-white">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {yesNoOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Outbound Calls</Label>
              <Controller
                name="outbound_calls"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full bg-white">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {yesNoOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Role in Call Center</Label>
              <Controller
                name="role_in_call_center"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full bg-white dark:bg-background">
                      <SelectValue placeholder="Select Role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleInCallCenterOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Call Access</Label>
              <Controller
                name="call_access"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full bg-white dark:bg-background">
                      <SelectValue placeholder="Access Level" />
                    </SelectTrigger>
                    <SelectContent>
                      {callsAccessOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2 max-w-md">
            <Label>Recording Downloads</Label>
            <Controller
              name="recording_downloads"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="w-full bg-white dark:bg-background">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {recordingsDownloadOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* --- OUTBOUND SETTINGS (Blue Box) --- */}
          {/* Always visible when Call Center is ON */}
          <div className="space-y-4 bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-md border border-blue-100 dark:border-blue-900">
            <Label className="text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-2">
              <Phone className="w-4 h-4" /> Outbound Settings
            </Label>

            {/* 1. Select Outbound Numbers - SHOW ALWAYS */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Select Outbound Numbers
              </Label>
              <div className="grid grid-cols-2 gap-2 bg-white dark:bg-background p-3 rounded border">
                <Controller
                  name="outbound_phone_number"
                  control={control}
                  render={({ field }) => (
                    <>
                      {phoneNumbers.map((obj) => {
                        const number = obj.phoneNumber;
                        const key = obj._id || number;
                        return (
                          <div
                            key={key}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={key}
                              checked={field.value?.includes(number)}
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                if (checked)
                                  field.onChange([...current, number]);
                                else
                                  field.onChange(
                                    current.filter((n) => n !== number)
                                  );
                              }}
                            />
                            <Label
                              htmlFor={key}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {number}{" "}
                              {obj.internalName ? `(${obj.internalName})` : ""}
                            </Label>
                          </div>
                        );
                      })}
                      {phoneNumbers.length === 0 && (
                        <p className="text-xs text-gray-500 p-2">
                          No phone numbers found
                        </p>
                      )}
                    </>
                  )}
                />
              </div>
              {errors.outbound_phone_number && (
                <p className="text-red-500 text-xs">
                  {errors.outbound_phone_number.message}
                </p>
              )}
            </div>

            {/* 2. Primary Number - HIDE if Outbound Calls is NO */}
            {outboundCallsValue === "yes" && (
              <div className="space-y-2">
                <Label>Primary Outbound Number</Label>
                <Controller
                  name="primary_outbound_phone_number"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="w-full bg-white dark:bg-background">
                        <SelectValue placeholder="Select Primary Number" />
                      </SelectTrigger>
                      <SelectContent>
                        {(selectedOutboundNumbers || []).map((num) => (
                          <SelectItem key={num} value={num}>
                            {num}
                          </SelectItem>
                        ))}
                        {(selectedOutboundNumbers || []).length === 0 && (
                          <SelectItem value="disabled" disabled>
                            Select outbound numbers first
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.primary_outbound_phone_number && (
                  <p className="text-red-500 text-xs">
                    {errors.primary_outbound_phone_number.message}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* --- INBOUND & GENERAL CALL SETTINGS (Purple Box) --- */}
          <div className="space-y-4 bg-purple-50/50 dark:bg-purple-950/20 p-4 rounded-md border border-purple-100 dark:border-purple-900">
            <Label className="text-purple-700 dark:text-purple-400 font-semibold flex items-center gap-2">
              <Phone className="w-4 h-4" /> Inbound & General Settings
            </Label>

            {/* 1. Max Calls Waiting - HIDE if Inbound Calls is NO */}
            {inboundCallsValue === "yes" && (
              <div className="space-y-2 max-w-md">
                <Label>Max Calls Waiting in Line</Label>
                <Controller
                  name="waiting_in_line"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="w-full bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {waitingInLineOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}

            {/* 2. Playback - SHOW ALWAYS */}
            <div className="space-y-2 max-w-md">
              <Label>Playback during Paused *</Label>
              <div className="space-y-3">
                <Controller
                  name="playback_during_paused"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="w-full bg-white dark:bg-background h-auto py-2">
                        {field.value === "default" && defaultAudio ? (
                          <div className="flex items-center justify-between w-full gap-2 pr-2 overflow-hidden">
                            <div className="flex items-center gap-2 truncate">
                              <FileAudio className="w-4 h-4 text-blue-500 shrink-0" />
                              <span className="truncate text-sm font-medium">
                                {defaultAudio.fileName}
                              </span>
                            </div>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                togglePlay(defaultAudio.fileUrl);
                              }}
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors z-50 shrink-0 focus:outline-none focus:ring-2 focus:ring-slate-400"
                            >
                              {isPlaying ? (
                                <Pause className="w-4 h-4 fill-current" />
                              ) : (
                                <Play className="w-4 h-4 fill-current" />
                              )}
                            </div>
                          </div>
                        ) : (
                          <SelectValue />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {playbackDuringPausedOptions.map((opt) => (
                          <SelectItem
                            key={opt.value}
                            value={opt.value}
                            disabled={opt.value === "default" && !defaultAudio}
                          >
                            {opt.label}
                            {opt.value === "default" &&
                              !defaultAudio &&
                              " (No default set)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {playbackDuringPausedValue === "choose" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-3 pt-2"
              >
                {/* Specific Playback Selection */}
                <div className="space-y-2">
                  <Label>Choose Specific Playback</Label>
                  <Controller
                    name="specific_playback_selection"
                    control={control}
                    render={({ field }) => (
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val);
                          setValue("playback", val);
                        }}
                        value={field.value}
                      >
                        <SelectTrigger className="w-full bg-white dark:bg-background">
                          <SelectValue placeholder="Select existing file" />
                        </SelectTrigger>
                        <SelectContent>
                          {audioFiles.map((file) => {
                            const fileUrl = file.fileUrl;
                            const key = file._id; // Use _id as key to avoid React warning
                            return (
                              <SelectItem key={key} value={fileUrl}>
                                {file.fileName}
                              </SelectItem>
                            );
                          })}
                          {audioFiles.length === 0 && (
                            <SelectItem value="none" disabled>
                              No existing audio files found
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {audioFiles.length === 0 && (
                    <p className="text-xs text-orange-500">
                      No audio files uploaded yet.
                    </p>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-300" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-purple-50 dark:bg-inherit px-2 text-slate-500">
                      Or Upload New
                    </span>
                  </div>
                </div>

                {/* Upload Zone */}
                <div
                  className={`border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center bg-white dark:bg-background transition-colors relative ${isDragOver
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                  ) : (
                    <Upload className="w-8 h-8 text-slate-400 mb-2" />
                  )}

                  <span className="text-sm text-slate-500 font-medium">
                    {uploadMutation.isPending
                      ? "Uploading..."
                      : "Click to upload or drag audio file (mp3, wav)"}
                  </span>

                  <Input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    id="audio-upload"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                  <label
                    htmlFor="audio-upload"
                    className="absolute inset-0 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  ></label>
                </div>
                {/* {playbackValue && !specificPlaybackValue && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 rounded text-sm border border-green-200 dark:border-green-900">
                    <FileAudio className="w-4 h-4" />
                    <span>Selected for upload: {playbackValue}</span>
                  </div>
                )} */}
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
