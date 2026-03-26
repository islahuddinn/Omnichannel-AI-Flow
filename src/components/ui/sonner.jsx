"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

/**
 * Global Toaster customized for light/dark themes.
 * Works with shadcn/ui design language and next-themes.
 */
const Toaster = ({ ...props }) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      richColors
      closeButton
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border shadow-lg rounded-xl px-4 py-3",
          title: "text-base font-semibold",
          description: "text-sm opacity-90",
          actionButton:
            "bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 rounded-md px-3 py-1 text-sm",
          cancelButton:
            "bg-muted text-muted-foreground hover:bg-muted/70 transition-all duration-200 rounded-md px-3 py-1 text-sm",
        },
      }}
      style={{
        "--normal-bg": "var(--background)",
        "--normal-text": "var(--foreground)",
        "--normal-border": "var(--border)",
        "--success-bg": "hsl(142.1 76.2% 36.3%)",
        "--success-text": "hsl(0 0% 100%)",
        "--error-bg": "hsl(0 84.2% 60.2%)",
        "--error-text": "hsl(0 0% 100%)",
        "--info-bg": "hsl(217.2 91.2% 59.8%)",
        "--info-text": "hsl(0 0% 100%)",
      }}
      {...props}
    />
  );
};

export { Toaster };
