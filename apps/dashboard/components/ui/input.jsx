import { cn } from "@/lib/utils";
export function Input({ className, ...props }) { return <input className={cn("flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring", className)} {...props} />; }
