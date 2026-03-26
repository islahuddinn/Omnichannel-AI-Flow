import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="p-8 rounded-lg bg-card shadow-xl border border-border">
        <div className="flex flex-col items-center" role="status">
          <Loader2 className="h-12 w-12 animate-spin motion-reduce:animate-none text-primary" />
          <h2 className="mt-4 text-xl font-semibold text-foreground">Loading...</h2>
          <p className="mt-2 text-muted-foreground">Please wait while we process your request</p>
          <span className="sr-only">Loading login page</span>
        </div>
      </div>
    </div>
  );
}
