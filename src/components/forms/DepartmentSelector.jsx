// src/components/forms/DepartmentSelector.jsx
'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import apiClient from '@/lib/api/client';

export default function DepartmentSelector({ 
  value = [], 
  onChange, 
  required = false,
  multiple = true,
  className 
}) {
  const [open, setOpen] = useState(false);
  const [selectedDepartments, setSelectedDepartments] = useState(value);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiClient.get('/departments?status=active'),
    select: (data) => data.data || []
  });

  useEffect(() => {
    setSelectedDepartments(value);
  }, [value]);

  const handleSelect = (departmentId) => {
    let newSelected;
    
    if (multiple) {
      if (selectedDepartments.includes(departmentId)) {
        newSelected = selectedDepartments.filter(id => id !== departmentId);
      } else {
        newSelected = [...selectedDepartments, departmentId];
      }
    } else {
      newSelected = [departmentId];
      setOpen(false);
    }
    
    setSelectedDepartments(newSelected);
    onChange(newSelected);
  };

  const removeDepartment = (departmentId) => {
    const newSelected = selectedDepartments.filter(id => id !== departmentId);
    setSelectedDepartments(newSelected);
    onChange(newSelected);
  };

  const getDepartmentName = (id) => {
    const dept = departments.find(d => d._id === id);
    return dept ? dept.name : 'Unknown Department';
  };

  return (
    <div className={cn('space-y-3', className)}>
      <Label className="text-gray-900 dark:text-gray-100">
        Department {required && <span className="text-red-500">*</span>}
        {required && (
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(At least one department required)</span>
        )}
      </Label>

      {selectedDepartments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedDepartments.map((deptId) => (
            <Badge 
              key={deptId} 
              variant="secondary"
              className="px-3 py-1 text-sm"
            >
              {getDepartmentName(deptId)}
              <button
                type="button"
                onClick={() => removeDepartment(deptId)}
                className="ml-2 text-gray-500 hover:text-red-500"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100"
          >
            <span className="truncate">
              {selectedDepartments.length === 0 
                ? 'Select department' 
                : multiple 
                  ? `${selectedDepartments.length} department(s) selected`
                  : getDepartmentName(selectedDepartments[0])
              }
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-lg">
          <Command shouldFilter={false} className="bg-white dark:bg-gray-800">
            <div className="pb-2 pt-2 overflow-hidden [&_[data-slot=command-input-wrapper]]:gap-3 [&_[data-slot=command-input-wrapper]]:pb-3 [&_[data-slot=command-input-wrapper]]:mb-0 [&_[data-slot=command-input-wrapper]:focus-within]:border-b-blue-500 [&_[data-slot=command-input-wrapper]:focus-within]:border-b-2 [&_[data-slot=command-input-wrapper]:focus-within]:dark:border-b-blue-400">
              <CommandInput 
                placeholder="Search departments..." 
                className="h-10 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 pl-2 focus:outline-none focus:rounded-md"
              />
            </div>
            <CommandList className="max-h-[400px] bg-white dark:bg-gray-800">
              <CommandEmpty className="text-gray-500 dark:text-gray-400 py-6">
                {isLoading ? 'Loading departments...' : 'No department found.'}
              </CommandEmpty>
              <CommandGroup className="max-h-64 overflow-auto bg-white dark:bg-gray-800">
              {departments.map((department) => (
                <CommandItem
                  key={department._id}
                  value={department._id}
                  onSelect={() => handleSelect(department._id)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedDepartments.includes(department._id) 
                        ? 'opacity-100' 
                        : 'opacity-0'
                    )}
                  />
                  {department.name}
                  {department.description && (
                    <span className="ml-2 text-xs text-gray-500">
                      - {department.description}
                    </span>
                  )}
                </CommandItem>
              ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {required && selectedDepartments.length === 0 && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Please select at least one department
        </p>
      )}
    </div>
  );
}