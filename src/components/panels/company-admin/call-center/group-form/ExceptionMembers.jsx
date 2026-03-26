'use client';

import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

const ExceptionMembers = ({
    value = [],
    onChange,
    assignedOperators = [],
    employees = [],
}) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedMembers, setSelectedMembers] = useState([]);

    // Initialize with current value
    useEffect(() => {
        if (value && value.length > 0) {
            setSelectedMembers(value);
        } else {
            setSelectedMembers([]);
        }
    }, [value]);

    // Get assigned operators details from employees list
    const assignedOperatorDetails = employees.filter((employee) =>
        assignedOperators.includes(employee.user_id)
    );

    const filteredEmployees = assignedOperatorDetails.filter((employee) =>
        employee.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelectMember = (member) => {
        const newSelectedMembers = selectedMembers.includes(member.user_id)
            ? selectedMembers.filter((id) => id !== member.user_id)
            : [...selectedMembers, member.user_id];

        setSelectedMembers(newSelectedMembers);
        onChange(newSelectedMembers);
    };

    const getSelectedText = () => {
        if (selectedMembers.length === 0) return "Select exceptional members";

        const selectedNames = selectedMembers
            .map((id) => {
                const employee = employees.find((e) => e.user_id === id);
                return employee ? employee.name : "";
            })
            .filter((name) => name !== "");

        return selectedNames.length > 2
            ? `${selectedNames.length} members selected`
            : selectedNames.join(", ");
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    id="exception-member-select"
                    variant="outline"
                    className={`w-full justify-between text-[13.82px] font-normal bg-input hover:bg-input border-border backdrop-blur-sm hover:text-foreground ${selectedMembers.length > 0 ? "text-foreground" : "text-muted-foreground"
                        }`}
                    disabled={assignedOperators.length === 0}
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
                                        id={`exception-member-${employee.user_id}`}
                                        checked={selectedMembers.includes(employee.user_id)}
                                        onCheckedChange={() => handleSelectMember(employee)}
                                        className="mr-2"
                                    />
                                    <label
                                        htmlFor={`exception-member-${employee.user_id}`}
                                        className="text-sm cursor-pointer flex-1 user-select-none"
                                        onClick={(e) => e.preventDefault()}
                                    >
                                        {employee.name}
                                    </label>
                                </div>
                            ))
                        ) : (
                            <div className="p-2 text-sm text-muted-foreground text-center">
                                {searchQuery
                                    ? "No members found"
                                    : "No assigned operators available"}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
};

export default ExceptionMembers;
