export default function Loading() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="flex flex-col items-center space-y-4">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <div className="text-foreground text-2xl font-semibold tracking-wider">
                    Loading...
                </div>
                <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-primary rounded-full animate-bounce"></div>
                    <div className="w-3 h-3 bg-primary rounded-full animate-bounce delay-100"></div>
                    <div className="w-3 h-3 bg-primary rounded-full animate-bounce delay-200"></div>
                </div>
            </div>
        </div>
    );
}
