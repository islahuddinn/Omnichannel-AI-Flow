"use client";

import { useEffect } from "react"; // Added useEffect
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader, ArrowRight } from "lucide-react";
import PhoneInput from "@/components/shared/PhoneInput";
import { useAddPhoneNumber, useUpdatePhoneNumber } from "@/hooks/usePhoneNumbers";
import DepartmentSelector from "@/components/forms/DepartmentSelector";

// Validation schema
const addNumberSchema = z.object({
  internalName: z
    .string()
    .min(1, "Name is required")
    .min(3, "Name must be at least 3 characters"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  departments: z.array(z.string()).optional(),
});

const normalizePhoneNumber = (phone) => {
  if (!phone) return "";

  // Remove spaces
  let normalized = phone.replace(/\s+/g, "");

  // Remove leading +
  if (normalized.startsWith("+")) {
    normalized = normalized.slice(1);
  }

  // Ensure it starts with 00
  if (!normalized.startsWith("00")) {
    normalized = `00${normalized}`;
  }

  return normalized;
};

export function AddNumberDialog({ isOpen, onClose, initialData = null }) {
  const addNumberMutation = useAddPhoneNumber();
  const updateNumberMutation = useUpdatePhoneNumber();

  const isEditing = !!initialData;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(addNumberSchema),
    defaultValues: {
      internalName: "",
      phoneNumber: "",
      departments: [],
    },
  });

  const phoneNumberValue = watch("phoneNumber");
  const departmentsValue = watch("departments");

  // Sync initialData when dialog opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // Handle Phone Number: Remove leading 00 if present for Display
        let phone = initialData.phoneNumber || "";
        if (phone.startsWith("00")) {
          phone = phone.substring(2);
        }

        reset({
          internalName: initialData.internalName || "",
          phoneNumber: phone,
          departments: initialData.departments
            ? initialData.departments.map((d) => (typeof d === "object" ? d._id : d))
            : [],
        });
      } else {
        reset({
          internalName: "",
          phoneNumber: "",
          departments: [],
        });
      }
    }
  }, [isOpen, initialData, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (data) => {
    try {
      const formattedPhone = normalizePhoneNumber(data.phoneNumber);
      const departmentIds = Array.isArray(data.departments) && data.departments.length > 0
        ? data.departments
        : [];

      if (isEditing) {
        await updateNumberMutation.mutateAsync({
          id: initialData._id,
          phoneNumber: formattedPhone,
          internalName: data.internalName,
          departmentIds: departmentIds, // API expects departmentIds
        });
        toast.success("Phone number updated successfully");
      } else {
        await addNumberMutation.mutateAsync({
          phoneNumber: formattedPhone,
          internalName: data.internalName,
          departments: departmentIds,
        });
        toast.success("Phone number added successfully");
      }

      handleClose();
    } catch (error) {
      console.error("Save number error:", error);
      toast.error(
          error.response?.data?.message || `Failed to ${isEditing ? "update" : "add"} phone number`
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent 
        className="sm:max-w-[600px] max-w-[95vw] p-0 rounded-2xl border border-border shadow-xl bg-card overflow-hidden"
        style={{ borderRadius: '16px' }}
      >
        <DialogHeader 
          className="px-5 py-[18px] bg-gradient-to-b from-card to-muted/30 border-b border-border"
        >
          <DialogTitle className="font-bold text-[20px] leading-[23px] tracking-[0.2px] text-foreground font-['Roboto']">
            {isEditing ? "Edit Phone Number" : "Add New Phone Number"}
          </DialogTitle>
          <DialogDescription className="text-[12.9px] leading-[15px] text-muted-foreground font-['Roboto'] font-normal mt-1">
            {isEditing ? "Update the phone number in your directory." : "Create a new phone number in your directory."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pt-[18px] pb-5">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="internalName"
                className="flex items-start gap-1 py-[1px]"
              >
                <span className="font-['Roboto'] font-bold text-[13px] leading-[15px] text-foreground">Internal Name</span>
                <span className="font-['Roboto'] font-bold text-[13px] leading-[15px] text-destructive">*</span>
              </label>
              <Input
                id="internalName"
                {...register("internalName")}
                placeholder="e.g. Sales Line"
                className="h-11 px-3 py-3 bg-card border border-border rounded-xl font-['Inter'] text-[13.3px] leading-4 text-foreground placeholder:text-muted-foreground"
              />
              {errors.internalName && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.internalName.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="phoneNumber"
                className="flex items-start gap-1 py-[1px]"
              >
                <span className="font-['Roboto'] font-bold text-[13px] leading-[15px] text-foreground">Phone Number</span>
                <span className="font-['Roboto'] font-bold text-[13px] leading-[15px] text-destructive">*</span>
              </label>
              <PhoneInput
                value={phoneNumberValue}
                onChange={(val) => setValue("phoneNumber", val)}
              />
              {errors.phoneNumber && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.phoneNumber.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="w-full">
                <DepartmentSelector
                  value={departmentsValue || []}
                  onChange={(value) => setValue("departments", value)}
                  required={false}
                  multiple={true}
                  className="worksans"
                />
              </div>
              {errors.departments && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.departments.message}
                </p>
              )}
            </div>

            <div className="flex justify-end items-center gap-[15px] pt-4 border-t border-border">
              <Button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting || addNumberMutation.isPending}
                className="h-[39px] px-4 py-3 bg-muted shadow-sm rounded-xl font-['Inter'] font-bold text-[12.8px] leading-[15px] text-foreground hover:bg-muted/80"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || addNumberMutation.isPending}
                className="h-[42px] px-4 py-3 bg-gradient-to-b from-primary to-primary/80 shadow-sm rounded-xl font-['Inter'] font-bold text-[12.8px] leading-[15px] text-white hover:opacity-90"
              >
                {isSubmitting || addNumberMutation.isPending ? (
                  <span className="flex items-center">
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </span>
                ) : (
                  <span className="flex items-center">
                    {isEditing ? "Update Number" : (
                      <>
                        <ArrowRight className="mr-2 h-4 w-4" />
                        Add Number
                      </>
                    )}
                  </span>
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
