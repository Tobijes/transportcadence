"use client";

import { cn } from "@/lib/utils";

interface TransfersSelectorProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const OPTIONS = [0, 1, 2];

export function TransfersSelector({ value, onChange, disabled }: TransfersSelectorProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-foreground">Skift</label>
      <div className="inline-flex h-10 rounded-md border border-input bg-transparent p-0.5">
        {OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              "h-9 min-w-9 px-2 text-sm font-medium rounded-sm transition-colors",
              "disabled:pointer-events-none disabled:opacity-50",
              value === n
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
