"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Pencil, Waypoints } from "lucide-react";
import Image from "next/image";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import PhoneNumberDisplay from "@/components/shared/PhoneNumberDisplay";

export default function CallRoutingTable({
  data,
  onEdit,
  onEditNumber,
  onExternalRouting,
  searchQuery,
  setSearchQuery,
}) {
  const getFirstStep = (flowData) => {
    // Logic to find first step description
    if (!flowData || !flowData.nodes) return "No Flow";
    const node2 = flowData.nodes.find((n) => n.type === "customNode2");
    if (!node2) return "Start";

    const d = node2.data;
    if (d.agentId) return `Agent (${d.agentName})`;
    if (d.groupId) return `Group (${d.groupName})`;
    if (d.audioId) return "Playback";
    if (d.externalNumber) return `External (${d.externalNumName})`;
    return "Flow Configured";
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Table Area */}
      <div className="flex-1 border rounded-md overflow-hidden flex flex-col">
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader className="bg-muted sticky top-0 z-10">
              <TableRow>
                <TableHead>
                  #<span className="float-right text-border">|</span>
                </TableHead>
                <TableHead>
                  PHONE NUMBER
                  <span className="float-right text-border">|</span>
                </TableHead>
                <TableHead>
                  INTERNAL NAME OF NUMBER
                  <span className="float-right text-border">|</span>
                </TableHead>
                <TableHead>
                  DEPARTMENT
                  <span className="float-right text-border">|</span>
                </TableHead>
                <TableHead>
                  FIRST STEP IN THE FLOW
                  <span className="float-right text-border">|</span>
                </TableHead>
                <TableHead>ACTION</TableHead>
                {/* <TableHead>EXTERNAL ROUTING</TableHead> */}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length > 0 ? (
                data.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">#{index + 1}</TableCell>
                    <TableCell>
                      <PhoneNumberDisplay
                        phone={
                          row.phoneNumber?.startsWith("00")
                            ? `+${row.phoneNumber.slice(2)}`
                            : row.phoneNumber
                        }
                      />
                    </TableCell>
                    <TableCell>{row.internalName}</TableCell>
                    <TableCell>
                      {row.departments && row.departments.length > 0
                        ? row.departments.map((dept) => dept.name).join(', ')
                        : '-'}
                    </TableCell>
                    <TableCell>{getFirstStep(row.flowData)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-1"
                                onClick={() => onEditNumber && onEditNumber(row)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit Number</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-1"
                                onClick={() => onEdit(row._id)}
                              >
                                <Waypoints className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit Flow</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                    {/* <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-1"
                              onClick={() =>
                                onExternalRouting && onExternalRouting(row)
                              }
                            >
                              <Image
                                src="/images/icons/ex-routing.svg" // Placeholder, might not exist
                                alt="routing"
                                width={16}
                                height={16}
                                onError={(e) => {
                                  e.target.style.display = "none";
                                }} // Fallback
                              />
                              <span className="text-xs ">External</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>External Routing</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell> */}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No routing config found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
