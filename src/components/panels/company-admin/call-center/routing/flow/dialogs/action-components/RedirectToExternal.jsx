'use client';

import { Input } from "@/components/ui/input";
import React, { useEffect } from "react";
import { Info } from "lucide-react";
import PhoneInput from "@/components/shared/PhoneInput"; // Using Shared component

function RedirectToExternal({
    setExternalNumtime,
    externalNumtime,
    setExternalNumber,
    externalNumber,
    setExternalNumName,
    externalNumName,
    initialData,
    errors,
}) {

    useEffect(() => {
        if (initialData) {
            setExternalNumName(initialData.externalNumName || "");
            setExternalNumtime(initialData.externalNumtime || "");

            let phone = initialData.externalNumber || "";
            // Clean up phone format if needed
            if (phone.startsWith("00")) {
                phone = phone.substring(2);
            }
            if (phone && !phone.startsWith("+")) {
                phone = `+${phone}`;
            }
            setExternalNumber(phone);
        }
    }, [initialData]);

    const handlePhoneChange = (phone) => {
        setExternalNumber(phone);
    };

    return (
        <div className="flex flex-col gap-3">
            <div>
                <label className="worksans text-xs text-foreground pb-2">Name</label>
                <Input
                    placeholder="Enter Name"
                    value={externalNumName}
                    onChange={(e) => setExternalNumName(e.target.value)}
                />
                {errors?.externalNumName && <p className="text-destructive text-[10px] mt-1">{errors.externalNumName}</p>}
            </div>
            <div className="bg-muted border-[1px] border-border p-3 rounded-[5px] flex flex-col gap-3">
                <div className="flex items-center gap-5">
                    <Info className="text-muted-foreground" size={40} />
                    <p className="text-foreground">Set the next step as a fallback</p>
                </div>
                <p className="text-xs text-muted-foreground">
                    If the forwarded call is not picked up within the set time, the flow
                    will continue with the next action. If no further action follows, the
                    call will be terminated.
                </p>
            </div>
            <div>
                <label className="worksans text-xs text-foreground pb-2">
                    Waiting Time for this Step in Seconds
                </label>
                <Input
                    placeholder="Enter time in Seconds"
                    value={externalNumtime}
                    onChange={(e) => setExternalNumtime(e.target.value)}
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    type="number"
                />
                {errors?.externalNumtime && <p className="text-destructive text-[10px] mt-1">{errors.externalNumtime}</p>}
            </div>
            <div>
                <label className="worksans text-xs text-foreground pb-2">
                    The number you want to forward to
                </label>
                <div>
                    <PhoneInput
                        value={externalNumber}
                        onChange={handlePhoneChange}
                        placeholder="Phone number"
                    />
                    {errors?.externalNumber && <p className="text-destructive text-[10px] mt-1">{errors.externalNumber}</p>}
                </div>
            </div>
        </div>
    );
}

export default RedirectToExternal;
