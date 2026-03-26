import React from "react";

export const StatCard = ({
  icon,
  value,
  label,
  trend,
  percent = false,
  isLoading = false,
}) => {
  return (
    <div className="relative w-full max-w-[226px] h-[103px] bg-card shadow-lg rounded-[14px] p-4 border border-border">
      {/* Content Container */}
      <div className="flex flex-col items-start gap-2.5 h-full">
        {isLoading ? (
          <div className="h-[33px] w-24 bg-muted animate-pulse rounded"></div>
        ) : (
          <div className="font-bold text-2xl leading-[33px] tracking-[1px] text-foreground">
            {value} {percent && "%"}
          </div>
        )}
        <div className="font-semibold text-sm leading-[19px] text-foreground opacity-70 dark:opacity-80">
          {label}
        </div>
      </div>

      {/* Icon Container */}
      <div className="absolute right-4 top-[35%] -translate-y-1/2 w-10 h-10 bg-primary/10 dark:bg-primary/20 rounded-xl flex items-center justify-center">
        <div className="w-5 h-5 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">
          {icon}
        </div>
      </div>
    </div>
  );
};
