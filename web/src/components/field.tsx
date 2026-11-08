import type { ComponentProps } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

/** A labelled input whose error is announced as its accessible description. */
export function Field({
  id,
  label,
  error,
  ...props
}: ComponentProps<"input"> & { id: string; label: string; error: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        autoComplete="off"
        aria-invalid={!!error}
        aria-describedby={`${id}-error`}
        className="min-h-12"
        {...props}
      />
      <p id={`${id}-error`} className="text-sm text-destructive">
        {error}
      </p>
    </div>
  );
}
