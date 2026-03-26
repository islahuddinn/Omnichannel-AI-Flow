"use client";

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export default function DeleteButton({ onClick, className = "", size = "sm", children = "Delete" }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className={`text-destructive hover:opacity-80 flex-1 sm:flex-initial shrink-0 ${className}`}
      size={size}
    >
      <Trash2
        className="mr-1.5 sm:mr-2 h-4 w-4 shrink-0 text-destructive"
      />
      <span className="truncate">{children}</span>
    </Button>
  );
}

