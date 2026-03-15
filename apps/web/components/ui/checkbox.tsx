"use client";

import { cn } from "@/lib/utils/cn";

export function Checkbox({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "checked"> & {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className={cn("h-4 w-4 rounded border-input text-primary focus:ring-ring", className)}
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
      {...props}
    />
  );
}
