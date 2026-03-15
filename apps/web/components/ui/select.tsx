"use client";

import { cn } from "@/lib/utils/cn";

export function Select({
  className,
  options,
  value,
  onChange,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      value={value}
      onChange={onChange}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
