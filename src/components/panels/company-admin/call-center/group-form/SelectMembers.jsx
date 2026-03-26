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
import React, { useState, useEffect } from "react";
import { ChevronDown, Loader } from "lucide-react";

const SelectMembers = ({
    value = [],
    onChange,
    placeholder = "Select Members",
    employees = [],
    disabled = false,
    emptyMessage,
}) => {
    // Selected members state
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");

    // Initialize selectedMembers from value prop
    useEffect(() => {
        if (value?.length > 0 && employees.length > 0) {
            const initialSelection = employees.filter((emp) =>
                value.includes(emp.user_id)
            );
            setSelectedMembers(initialSelection);
        } else {
            setSelectedMembers([]);
        }
    }, [value, employees]);

    // Handle member selection
    const handleSelectMember = (member) => {
        // Determine if we are adding or removing
        const isSelected = selectedMembers.some((m) => m.user_id === member.user_id);
        let newSelection;

        if (isSelected) {
            newSelection = selectedMembers.filter((m) => m.user_id !== member.user_id);
        } else {
            newSelection = [...selectedMembers, member];
        }

        // Optimistically update local state for UI responsiveness
        setSelectedMembers(newSelection);

        // Propagate changes
        onChange(newSelection.map((m) => m.user_id));
    };

    // Get selected members text
    const getSelectedText = () => {
        if (selectedMembers.length === 0) return placeholder;
        if (selectedMembers.length === 1) return selectedMembers[0].name;
        return `${selectedMembers.length} Members selected`;
    };

    // Filter employees based on search query
    const filteredEmployees = employees.filter((emp) =>
        emp.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const resolvedEmptyMessage =
        emptyMessage ||
        (disabled
            ? "Select department first"
            : (searchQuery ? "No members found" : "No members available"));

    return (
        <div className="w-full">
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="member-select"
                        variant="outline"
                        className={`w-full justify-between text-[13.82px] font-normal bg-input hover:bg-input border-border backdrop-blur-sm hover:text-foreground ${selectedMembers.length > 0 ? "text-foreground" : "text-muted-foreground"
                            }`}
                        disabled={disabled}
                    >
                        {getSelectedText()}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full min-w-[300px] p-0" align="start">
                    <div className="flex items-center space-x-2 p-2 border-b">
                        <Input
                            placeholder="Search members..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8"
                        />
                    </div>
                    <ScrollArea className="max-h-[200px] h-auto w-full">
                        <div className="p-1">
                            {filteredEmployees.length > 0 ? (
                                filteredEmployees.map((employee) => (
                                    <div
                                        key={employee.user_id}
                                        className="flex items-center px-2 py-1.5 hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-sm"
                                        onClick={() => handleSelectMember(employee)}
                                    >
                                        <Checkbox
                                            id={`member-${employee.user_id}`}
                                            checked={selectedMembers.some(
                                                (m) => m.user_id === employee.user_id
                                            )}
                                            onCheckedChange={() => handleSelectMember(employee)}
                                            className="mr-2"
                                        />
                                        <label
                                            htmlFor={`member-${employee.user_id}`}
                                            className="text-sm cursor-pointer flex-1 user-select-none"
                                            onClick={(e) => e.preventDefault()} // Prevent double toggle
                                        >
                                            {employee.name}
                                        </label>
                                    </div>
                                ))
                            ) : (
                                <div className="p-2 text-sm text-muted-foreground text-center">
                                    {resolvedEmptyMessage}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </PopoverContent>
            </Popover>
        </div>
    );
};

export default SelectMembers;
