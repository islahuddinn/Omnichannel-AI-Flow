import React, { useState, useEffect } from "react";
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

const SelectOutboundNumbers = ({ value = [], onChange, outboundNumbers = [], isLoading = false }) => {
    // value is expected to be an array of strings (names/numbers)
    // outboundNumbers is expected to be array of objects { id, name, internalName }

    const [selectedNumbers, setSelectedNumbers] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");

    // Initialize selectedNumbers from value prop
    useEffect(() => {
        if (outboundNumbers.length > 0) {
            const initialSelection = outboundNumbers.filter((num) =>
                value.includes(num.name)
            );
            setSelectedNumbers(initialSelection);
        }
    }, [value, outboundNumbers]);

    const handleSelectNumber = (number) => {
        setSelectedNumbers((prev) => {
            const isSelected = prev.some((num) => num.id === number.id);
            const newSelection = isSelected
                ? prev.filter((num) => num.id !== number.id)
                : [...prev, number];

            // Call onChange with array of selected numbers (names)
            onChange(newSelection.map((num) => num.name));
            return newSelection;
        });
    };

    const getSelectedText = () => {
        if (isLoading) return "Loading...";
        if (outboundNumbers.length === 0) return "No Numbers Available";

        if (selectedNumbers.length === 0) return "Select";
        if (selectedNumbers.length === 1) return selectedNumbers[0].name;
        return `${selectedNumbers.length} Numbers selected`;
    };

    const filteredNumbers = outboundNumbers.filter((number) =>
        number.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (number.internalName && number.internalName.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (isLoading || outboundNumbers.length === 0) {
        return (
            <div className="w-full">
                <Button
                    variant="outline"
                    disabled={true}
                    className={`w-full justify-between bg-muted border-border text-[13.82px] font-normal text-muted-foreground`}
                >
                    {getSelectedText()}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </div>
        );
    }

    return (
        <div className="w-full">
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="outbound-numbers-select"
                        variant="outline"
                        className={`w-full justify-between bg-muted hover:bg-muted border-border text-[13.82px] font-normal hover:text-none ${selectedNumbers.length > 0 ? "text-foreground" : "text-muted-foreground"
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
                        {filteredNumbers.map((number) => (
                            <div
                                key={number.id}
                                className="flex items-start px-2 py-2 hover:bg-gray-100 cursor-pointer"
                                onClick={() => handleSelectNumber(number)}
                            >
                                <Checkbox
                                    id={`number-${number.id}`}
                                    checked={selectedNumbers.some((num) => num.id === number.id)}
                                    onCheckedChange={() => handleSelectNumber(number)}
                                    className="mr-2 mt-1"
                                />
                                <label
                                    htmlFor={`number-${number.id}`}
                                    className="text-sm cursor-pointer flex-1"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="flex flex-col">
                                        <span className="font-medium">{number.name}</span>
                                        {number.internalName && (
                                            <span className="text-xs text-gray-500">{number.internalName}</span>
                                        )}
                                    </div>
                                </label>
                            </div>
                        ))}
                        {filteredNumbers.length === 0 && (
                            <div className="p-4 text-center text-sm text-gray-500">
                                No numbers found
                            </div>
                        )}
                    </ScrollArea>
                </PopoverContent>
            </Popover>
        </div>
    );
};

export default SelectOutboundNumbers;
