import React from "react";

function TagsCard({ tags = [] }) {
    return (
        <div className="bg-card rounded-[14px] px-4 py-[14px] border border-border shadow-[0px_10px_24px_0px_#0F172A12]">
            <h2 className="font-bold text-xs text-foreground mb-3">Tags</h2>
            <div className="flex flex-wrap gap-2">
                {tags.map((tag, idx) => (
                    <span
                        key={idx}
                        className="inline-flex items-center gap-2 px-[8px] py-[5px] bg-muted border border-border text-foreground rounded-full text-[10px] font-normal"
                    >
                        📋 {tag}
                    </span>
                ))}
            </div>
        </div>
    );
}

export default TagsCard;
