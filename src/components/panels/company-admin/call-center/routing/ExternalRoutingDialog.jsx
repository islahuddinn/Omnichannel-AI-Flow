'use client';

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Plus, Save, Trash2, FolderOpen, Loader2 } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import PhoneInput from "@/components/shared/PhoneInput";

const CONTACT_TYPES = [
    { value: "handyman", label: "Handyman" },
    { value: "customer", label: "Customer" },
    { value: "unknown_number", label: "Unknown Number" },
];

const DESTINATIONS = [
    { value: "ai_voice_bot", label: "AI Voice Bot" },
    { value: "omnichannel", label: "Omnichannel" },
    { value: "forward_to_external_number", label: "Forward To External Number" },
];

export function ExternalRoutingDialog({ isOpen, onClose, routingData }) {
    const [isLoading, setIsLoading] = useState(false);
    const [rowsData, setRowsData] = useState([]); // Mock API state for this routing

    const { control, watch, setValue, getValues, reset } = useForm({
        defaultValues: {
            rows: [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "rows",
    });

    const rows = watch("rows");

    // Mock Fetch Data when dialog opens
    useEffect(() => {
        if (isOpen && routingData) {
            // In real app, fetch from API. Here we mock empty or existing.
            // For demonstration, let's assume empty unless we saved something in memory (not persistent across reloads here)
            reset({ rows: [] });
        }
    }, [isOpen, routingData, reset]);

    const handleClose = () => {
        reset({ rows: [] });
        onClose();
    };

    const getUsedContactTypes = (excludeIndex) => {
        return rows
            .map((row, idx) => (idx !== excludeIndex ? row.contactType : null))
            .filter(Boolean);
    };

    const isContactTypeAvailable = (contactType, currentIndex) => {
        if (!contactType) return true;
        const usedTypes = getUsedContactTypes(currentIndex);
        return !usedTypes.includes(contactType);
    };

    const hasRowChanged = (index) => {
        // Simplification for mock: always allow save if valid
        return true;
    };

    const validateRow = (rowData) => {
        if (!rowData.contactType) return "Please select contact type";
        if (!rowData.destination) return "Please select destination";
        if (
            rowData.destination === "forward_to_external_number" &&
            !rowData.phone
        ) {
            return "Please enter receiver's phone number";
        }
        return null;
    };

    const handleSaveRow = async (index) => {
        const rowData = getValues(`rows.${index}`);
        const validationError = validateRow(rowData);

        if (validationError) {
            toast.error(validationError);
            return;
        }

        try {
            setIsLoading(true);
            // Mock Save
            await new Promise(resolve => setTimeout(resolve, 800));

            // Mark as saved (fake ID)
            setValue(`rows.${index}.id`, Math.random());

            toast.success("External Routing saved");
        } catch (e) {
            toast.error("Failed to save");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteRow = async (index) => {
        remove(index);
        toast.success("Routing rule removed.");
    };

    const addNewRow = () => {
        append({
            contactType: "",
            destination: "",
            phone: "",
            _original: null,
        });
    };

    const canAddNewRow = useMemo(() => {
        const usedContactTypes = rows.map((row) => row.contactType).filter(Boolean);
        return usedContactTypes.length < CONTACT_TYPES.length;
    }, [rows]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="w-[900px] max-w-[95vw] rounded-2xl p-8 gap-0">
                <h2 className="text-lg font-bold">
                    {routingData?.phoneNumber || "External Routing"}
                </h2>
                <p className="text-[10px] text-muted-foreground">
                    External Routing Will Now Be Configured For This Number.
                </p>

                <hr className="my-4 border-t border-border" />

                <p className="mb-6 text-sm">
                    Any Call Received On This Number Will Be Diverted To The Configured Destination.
                </p>

                {fields.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FolderOpen size={48} className="text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold text-muted-foreground mb-2">No External Routing</h3>
                        <p className="text-sm text-muted-foreground mb-6">There are no external routing configurations yet.</p>
                    </div>
                ) : (
                    <div className="space-y-6 w-full min-h-[100px] max-h-[500px] overflow-y-auto pr-2">
                        {fields.map((field, index) => {
                            const dest = rows?.[index]?.destination;
                            const currentContactType = rows?.[index]?.contactType;
                            const currentDestination = rows?.[index]?.destination;

                            return (
                                <div key={field.id} className="flex items-end gap-4 justify-between w-full">
                                    <div className="flex items-center w-full">
                                        {/* Contact Type */}
                                        <div className="w-1/3">
                                            <label className="mb-2 text-xs text-foreground block">
                                                Select Contact Type*
                                            </label>
                                            <Controller
                                                control={control}
                                                name={`rows.${index}.contactType`}
                                                render={({ field: f }) => (
                                                    <Select value={f.value} onValueChange={f.onChange} disabled={isLoading}>
                                                        <SelectTrigger className="w-full text-sm">
                                                            <SelectValue placeholder="Select" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {CONTACT_TYPES.map((type) => (
                                                                <SelectItem
                                                                    key={type.value}
                                                                    value={type.value}
                                                                    disabled={!isContactTypeAvailable(type.value, index)}
                                                                >
                                                                    {type.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                        </div>

                                        {/* Connector */}
                                        <div className="flex items-center px-2 mt-6">
                                            <div className="w-[5px] h-[5px] rounded-full bg-foreground" />
                                            <div className="w-8 bg-foreground h-[2px]" />
                                            <div className="w-[5px] h-[5px] rounded-full bg-foreground" />
                                        </div>

                                        {/* Destination */}
                                        <div className="w-1/3">
                                            <label className="mb-2 text-xs text-foreground block">
                                                Select Destination*
                                            </label>
                                            <Controller
                                                control={control}
                                                name={`rows.${index}.destination`}
                                                render={({ field: f }) => (
                                                    <Select value={f.value} onValueChange={f.onChange} disabled={isLoading}>
                                                        <SelectTrigger className="w-full text-sm">
                                                            <SelectValue placeholder="Select" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {DESTINATIONS.map((d) => (
                                                                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                        </div>

                                        {dest === "forward_to_external_number" && (
                                            <>
                                                <div className="flex items-center px-2 mt-6">
                                                    <div className="w-[5px] h-[5px] rounded-full bg-foreground" />
                                                    <div className="w-8 bg-foreground h-[2px]" />
                                                    <div className="w-[5px] h-[5px] rounded-full bg-foreground" />
                                                </div>
                                                <div className="w-1/3">
                                                    <label className="mb-2 text-xs text-foreground block">
                                                        Receiver Phone*
                                                    </label>
                                                    <Controller
                                                        control={control}
                                                        name={`rows.${index}.phone`}
                                                        render={({ field }) => (
                                                            <PhoneInput value={field.value} onChange={field.onChange} />
                                                        )}
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 mb-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteRow(index)}
                                            className="p-2 rounded-md bg-destructive shadow-sm hover:shadow text-destructive-foreground"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSaveRow(index)}
                                            className="p-2 rounded-md bg-muted-foreground shadow-sm hover:shadow text-white"
                                        >
                                            <Save size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <hr className="mt-12 mb-2 border-t border-border" />

                <div className="flex items-center justify-end gap-4">
                    <p className="text-foreground text-[13px] font-medium">Add New External Routing</p>
                    <button
                        type="button"
                        onClick={addNewRow}
                        disabled={isLoading || !canAddNewRow}
                        className="inline-flex items-center gap-2 rounded-[5px] bg-destructive w-[34px] h-[34px] p-2 text-destructive-foreground shadow hover:brightness-95 disabled:opacity-50"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
