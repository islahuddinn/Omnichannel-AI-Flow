"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export default function SearchableSelect({
    items = [],
    value,
    onSelect,
    placeholder = "Select...",
    searchPlaceholder = "Search...",
    labelKey = "name",
    valueKey = "id",
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    // Find the selected item to display its label
    const selectedItem = items.find(
        (item) => String(item[valueKey]) === String(value)
    );

    // Client-side filtering logic
    // We filter the passed 'items' array based on the 'labelKey' and current 'search' state.
    const filteredItems = items.filter((item) => {
        const itemLabel = item[labelKey] ? String(item[labelKey]) : "";
        return itemLabel.toLowerCase().includes(search.toLowerCase());
    });

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[180px] justify-between text-muted-foreground font-normal hover:text-foreground bg-input border-border"
                >
                    {value
                        ? selectedItem?.[labelKey] || value
                        : placeholder}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={searchPlaceholder}
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {filteredItems.map((item) => (
                                <CommandItem
                                    key={item[valueKey]}
                                    value={String(item[valueKey])}
                                    onSelect={() => {
                                        onSelect(
                                            String(item[valueKey]) === value
                                                ? ""
                                                : String(item[valueKey])
                                        );
                                        setOpen(false);
                                        setSearch(""); // Reset search on selection
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === String(item[valueKey])
                                                ? "opacity-100"
                                                : "opacity-0"
                                        )}
                                    />
                                    {item[labelKey]}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
