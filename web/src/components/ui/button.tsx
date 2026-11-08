import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

// Adapted from shadcn/ui; only the default button is needed in this slice.
export function Button({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      data-slot="button"
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
