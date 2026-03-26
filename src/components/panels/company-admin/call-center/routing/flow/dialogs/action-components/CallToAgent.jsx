'use client';

import { Input } from "@/components/ui/input";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import React, { useEffect, useState } from "react";
import { useUsersWithCallFeature } from "@/hooks/useUsersWithCallFeature";

function CallToAgent({
    time,
    setTime,
    agentId,
    setAgentId,
    agentName,
    setAgentName,
    initialData,
    errors,
    departmentIds = [],
}) {
    const [open, setOpen] = useState(false);
    const [searchValue, setSearchValue] = useState("");

    // Fetch users (agents) filtered by departmentIds
    const { data: usersData, isLoading } = useUsersWithCallFeature(departmentIds);
    const agents = usersData || [];

    const handleAgentChange = (selectedUserId) => {
        const selectedEmployee = agents.find(
            (emp) => emp._id.toString() === selectedUserId
        );
        if (selectedEmployee) {
            setAgentId(selectedEmployee._id);
            setAgentName(`${selectedEmployee.firstName} ${selectedEmployee.lastName}`);
        }
        setOpen(false);
    };

    useEffect(() => {
        if (initialData) {
            setAgentId(initialData.agentId || "");
            setAgentName(initialData.agentName || "");
            setTime(initialData.time || "");
        }
    }, [initialData]);

    // Filter agents locally for the command list
    const filteredAgents = agents.filter(agent => {
        const fullName = `${agent.firstName} ${agent.lastName}`;
        return fullName.toLowerCase().includes(searchValue.toLowerCase());
    });

    return (
        <div className="flex flex-col gap-3">
            <div>
                <label className="worksans text-xs text-foreground pb-2">Agent</label>
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            className={cn(
                                "w-full justify-between",
                                !agentName ? "text-muted-foreground" : "text-foreground"
                            )}
                            disabled={isLoading}
                        >
                            {isLoading ? "Loading..." : (agentName || "Select Agent Name")}
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                        <Command shouldFilter={false}>
                            <CommandInput
                                placeholder="Search agent..."
                                value={searchValue}
                                onValueChange={setSearchValue}
                            />
                            <CommandList>
                                <CommandEmpty>No agent found.</CommandEmpty>
                                <CommandGroup>
                                    {filteredAgents.map((agent) => {
                                        const fullName = `${agent.firstName} ${agent.lastName}`;
                                        const isSelected =
                                            agentId?.toString() === agent._id.toString();
                                        return (
                                            <CommandItem
                                                key={agent._id}
                                                value={`${fullName} ${agent._id}`}
                                                onSelect={() =>
                                                    handleAgentChange(agent._id.toString())
                                                }
                                                className="cursor-pointer"
                                            >
                                                {fullName}
                                                <Check
                                                    className={cn(
                                                        "ml-auto h-4 w-4",
                                                        isSelected ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
                {errors?.agentId && <p className="text-destructive text-[10px] mt-1">{errors.agentId}</p>}
            </div >
            <div>
                <label className="worksans text-xs text-foreground pb-2">
                    Seconds to wait on this step
                </label>
                <Input
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    placeholder="Enter Seconds To Wait"
                    type="number"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {errors?.time && <p className="text-destructive text-[10px] mt-1">{errors.time}</p>}
            </div>
        </div >
    );
}

export default CallToAgent;
