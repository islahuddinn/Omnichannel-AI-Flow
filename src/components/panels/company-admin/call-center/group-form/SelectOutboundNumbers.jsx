'use client';

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown } from "lucide-react";
import React, { useState, useEffect } from "react";

const SelectOutboundNumbers = ({ value = [], onChange, phoneNumbers = [] }) => {
    const [selectedNumbers, setSelectedNumbers] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");

    // Initialize selectedNumbers from value prop and available phoneNumbers.
    // When phoneNumbers haven't loaded yet (e.g. edit mode), keep showing saved value so it's visible.
    useEffect(() => {
        if (!value || value.length === 0) {
            setSelectedNumbers([]);
            return;
        }
        const valueStr = value.map((v) => (v != null ? String(v) : ""));
        if (!phoneNumbers || phoneNumbers.length === 0) {
            setSelectedNumbers(valueStr);
            return;
        }
        const phoneStr = phoneNumbers.map((p) => (p != null ? String(p) : ""));
        const validNumbers = valueStr.filter((v) => phoneStr.includes(v));
        const fromValue = valueStr.filter((v) => !phoneStr.includes(v));
        setSelectedNumbers(fromValue.length > 0 ? [...validNumbers, ...fromValue] : validNumbers);
    }, [value, phoneNumbers]);

    // Handle number selection
    const handleSelectNumber = (number) => {
        const isSelected = selectedNumbers.includes(number);
        const newSelection = isSelected
            ? selectedNumbers.filter((n) => n !== number)
            : [...selectedNumbers, number];

        setSelectedNumbers(newSelection);
        onChange(newSelection);
    };

    // Get selected numbers text (show saved value even when phoneNumbers list not loaded yet)
    const getSelectedText = () => {
        if (selectedNumbers.length === 0) {
            if (!phoneNumbers || phoneNumbers.length === 0) return "No Numbers Available";
            return "Select";
        }
        if (selectedNumbers.length === 1) return selectedNumbers[0];
        return `${selectedNumbers.length} Numbers selected`;
    };

    const filteredNumbers = (phoneNumbers || []).filter((number) =>
        number.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="w-full">
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="outbound-numbers-select"
                        variant="outline"
                        className={`w-full justify-between bg-input hover:bg-input border-border backdrop-blur-sm text-[13.82px] font-normal hover:text-foreground ${selectedNumbers.length > 0 ? "text-foreground" : "text-muted-foreground"
                            }`}
                    >
                        {getSelectedText()}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full min-w-[300px] p-0" align="start">
                    <div className="flex items-center space-x-2 p-2 border-b">
                        <Input
                            placeholder="Search Numbers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8"
                        />
                    </div>
                    <ScrollArea className="max-h-[200px] h-auto w-full">
                        <div className="p-1">
                            {filteredNumbers.map((number) => (
                                <div
                                    key={number}
                                    className="flex items-center px-2 py-1.5 hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-sm"
                                    onClick={() => handleSelectNumber(number)}
                                >
                                    <Checkbox
                                        id={`number-${number}`}
                                        checked={selectedNumbers.includes(number)}
                                        onCheckedChange={() => handleSelectNumber(number)}
                                        className="mr-2"
                                    />
                                    <label
                                        htmlFor={`number-${number}`}
                                        className="text-sm cursor-pointer flex-1 user-select-none"
                                        onClick={(e) => e.preventDefault()}
                                    >
                                        <div className="flex flex-col">
                                            <span>{number}</span>
                                        </div>
                                    </label>
                                </div>
                            ))}
                            {filteredNumbers.length === 0 && (
                                <div className="p-2 text-sm text-muted-foreground text-center">
                                    No Outbound Numbers found
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </PopoverContent>
            </Popover>
        </div>
    );
};

export default SelectOutboundNumbers;
