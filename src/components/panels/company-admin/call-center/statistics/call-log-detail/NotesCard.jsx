import { Copy } from "lucide-react";
import React from "react";

function NotesCard({ title, children, className = "" }) {
    return (
        <div
            className={`bg-muted rounded-[18px] px-4 py-[14px] border border-border flex flex-col items-start relative ${className}`}
        >
            <h2 className="text-xs font-bold text-foreground mb-4">{title}</h2>
            {children}
            <button className="absolute bottom-4 right-4 p-2 hover:bg-primary/10 rounded-lg transition-colors">
                <Copy className="w-4 h-4 text-muted-foreground" />
            </button>
        </div>
    );
}

export default NotesCard;
