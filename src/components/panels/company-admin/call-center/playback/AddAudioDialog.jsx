"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Upload, Music, Pencil } from "lucide-react";
import { useState, useEffect } from "react";
import { useUploadAudio, useUpdateAudio } from "@/hooks/useAudioFiles";
import { toast } from "react-hot-toast";

const formSchema = z.object({
  fileName: z.string().optional(),
  is_default: z.boolean().default(false),
});

export default function AddAudioDialog({ initialData, onClose, trigger }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const isEditMode = !!initialData;

  const uploadMutation = useUploadAudio();
  const updateMutation = useUpdateAudio();

  const { register, handleSubmit, setValue, watch, reset } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fileName: "",
      is_default: false,
    },
  });

  useEffect(() => {
    if (initialData) {
      setValue("fileName", initialData.fileName || "");
      setValue("is_default", initialData.isDefault || false);
      setOpen(true); // Auto open if data passed? Or depend on parent?
      // If used in a list, we might render <AddAudioDialog initialData={selected} open={!!selected} ... />
      // But here we'll stick to local state if no props.
    }
  }, [initialData, setValue]);

  const isDefault = watch("is_default");

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setValue("fileName", selectedFile.name);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const selectedFile = droppedFiles[0];
      setFile(selectedFile);
      setValue("fileName", selectedFile.name);
    }
  };

  const onSubmit = async (data) => {
    try {
      if (isEditMode) {
        // Update Logic
        if (file) {
          // File replacement: use FormData
          const formData = new FormData();
          formData.append("file", file);
          formData.append("is_default", data.is_default);
          formData.append("fileName", data.fileName);

          await updateMutation.mutateAsync({
            id: initialData._id,
            data: formData,
          });
        } else {
          // Metadata only update (JSON)
          await updateMutation.mutateAsync({
            id: initialData._id,
            data: {
              fileName: data.fileName,
              isDefault: data.is_default,
            },
          });
        }
        toast.success("Audio updated successfully");
      } else {
        // Upload Logic
        if (!file) {
          toast.error("Please select an audio file");
          return;
        }
        // Hook expects { file, is_default } and handles FormData creation logic internally for upload
        await uploadMutation.mutateAsync({ file, is_default: data.is_default });
        toast.success("Audio uploaded successfully");
      }

      setOpen(false);
      reset();
      setFile(null);
      if (onClose) onClose();
    } catch (error) {
      console.error(isEditMode ? "Update failed" : "Upload failed", error);
      toast.error(
        isEditMode ? "Failed to update audio" : "Failed to upload audio"
      );
    }
  };

  const handleOpenChange = (val) => {
    setOpen(val);
    if (!val) {
      reset();
      setFile(null);
      if (onClose) onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!isEditMode && (
        <DialogTrigger asChild>
          {trigger || (
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
              <Plus className="w-4 h-4" /> Add Audio
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[500px] bg-background border-border">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Audio" : "Upload New Audio"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-4">
          {/* Edit Mode: File Name Input (Read Only) */}
          {isEditMode && (
            <div className="space-y-2">
              <Label htmlFor="fileName">File Name</Label>
              <Input
                id="fileName"
                {...register("fileName")}
                readOnly
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
            </div>
          )}

          {/* Default Switch */}
          <div className="flex items-center justify-between space-x-2 border p-3 rounded-md bg-muted/40">
            <Label htmlFor="is-default" className="flex flex-col space-y-1">
              <span>Set as Default</span>
              <span className="font-normal text-xs text-muted-foreground">
                This audio will be used as the default playback.
              </span>
            </Label>
            <Switch
              id="is-default"
              checked={isDefault}
              onCheckedChange={(checked) => setValue("is_default", checked)}
            />
          </div>

          {/* Upload Area - Always Visible */}
          <div
            className={`border-2 border-dashed rounded-md p-8 flex flex-col items-center justify-center transition-colors relative cursor-pointer
              ${
                isDragOver
                  ? "border-primary bg-primary/5 dark:bg-primary/10"
                  : "border-muted-foreground/25 hover:bg-muted/50"
              }
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() =>
              document.getElementById("dialog-audio-upload").click()
            }
          >
            {file ? (
              <div className="flex flex-col items-center text-center space-y-2">
                <Music className="w-10 h-10 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {file.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 mt-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    // If in Edit Mode, maybe revert to original name?
                    if (isEditMode && initialData) {
                      setValue("fileName", initialData.fileName);
                    }
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-muted-foreground mb-4" />
                <p className="text-sm text-foreground font-medium mb-1">
                  {isEditMode
                    ? "Click to replace audio or drag and drop"
                    : "Click to upload or drag and drop"}
                </p>
                <p className="text-xs text-muted-foreground">
                  MP3, WAV up to 10MB
                </p>
              </>
            )}
            <Input
              id="dialog-audio-upload"
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                uploadMutation.isPending ||
                updateMutation.isPending ||
                (!isEditMode && !file)
              }
            >
              {(uploadMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {isEditMode ? "Save Changes" : "Upload"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
