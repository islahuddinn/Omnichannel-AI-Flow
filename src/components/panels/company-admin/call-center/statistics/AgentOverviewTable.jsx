"use client";

import React from "react";
import {ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

export default function AgentOverviewTable({ agents = [], isLoading }) {
  // Helper function to get initials from first and last name
  const getInitials = (firstName, lastName) => {
    const first = firstName?.charAt(0)?.toUpperCase() || "";
    const last = lastName?.charAt(0)?.toUpperCase() || "";
    return `${first}${last}`;
  };

  // Helper function to get a consistent background color based on agent ID
  const getBgColor = (id) => {
    const colors = [
      "bg-blue-500",
      "bg-cyan-500",
      "bg-indigo-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-emerald-500",
      "bg-amber-500",
      "bg-amber-600",
    ];
    // Use a simple hash of the ID to pick a color
    const hash = id
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  if (isLoading) {
    return (
      <div className="w-full bg-card rounded-[8px] border border-border">
        <div className="px-2 py-3">
          <h2 className="text-primary font-bold text-xs border-b-2 border-b-primary w-fit pb-1">
            Overview
          </h2>
        </div>
        <div className="p-8 text-center text-muted-foreground">
          Loading agents...
        </div>
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <div className="w-full bg-card rounded-[8px] border border-border">
        <div className="px-2 py-3">
          <h2 className="text-primary font-bold text-xs border-b-2 border-b-primary w-fit pb-1">
            Overview
          </h2>
        </div>
        <div className="p-8 text-center text-muted-foreground">
          No agents found
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-card rounded-[8px] border border-border">
      {/* Tab Header */}
      <div className="px-2 py-3">
        <h2 className="text-primary font-bold text-xs border-b-2 border-b-primary w-fit pb-1">
          Overview
        </h2>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow className="bg-muted hover:bg-muted">
            <TableHead className="font-normal text-xs normal-case text-foreground">
              Agent
            </TableHead>
            <TableHead className="font-normal text-xs normal-case text-foreground">
              Online
            </TableHead>
            <TableHead className="font-normal text-xs normal-case text-foreground">
              Idle
            </TableHead>
            <TableHead className="font-normal text-xs normal-case text-foreground">
              On call
            </TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => {
            const initials = getInitials(agent.firstName, agent.lastName);
            const bgColor = getBgColor(agent._id);
            const fullName =
              `${agent.firstName || ""} ${agent.lastName || ""}`.trim() ||
              agent.email;

            return (
              <TableRow key={agent._id} className="hover:bg-muted/50">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div
                      className={`text-white w-6 h-6 text-[10.8px] font-bold rounded-full p-1 flex items-center justify-center ${bgColor}`}
                    >
                      {initials}
                    </div>
                    <div>
                      <div className="font-normal text-[11.3px] text-foreground">
                        {fullName}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-foreground text-[10.9px] font-normal">
                  {agent.statusTimes.online}
                </TableCell>
                <TableCell className="text-foreground text-[10.9px] font-normal">
                  {agent.statusTimes.idle}
                </TableCell>
                <TableCell className="text-foreground text-[10.9px] font-normal">
                  {agent.statusTimes.onCall}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/c/call-center/statistics/call-logs-overview/${agent._id}`}
                    className="w-6 h-6 bg-muted flex justify-center items-center p-1 rounded-full text-foreground hover:bg-primary/20"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
