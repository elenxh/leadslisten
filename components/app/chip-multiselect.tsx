"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ChipOption {
  id: string;
  label: string;
}

/**
 * Einfaches Mehrfach-Auswahlfeld als Toggle-Chips.
 * Bewusst ohne Popover, damit es in Dialogen robust funktioniert.
 */
export function ChipMultiSelect({
  options,
  value,
  onChange,
  emptyHint = "Keine Einträge verfügbar.",
  className,
}: {
  options: ChipOption[];
  value: string[];
  onChange: (next: string[]) => void;
  emptyHint?: string;
  className?: string;
}) {
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyHint}</p>;
  }

  function toggle(id: string) {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => {
        const active = value.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-transparent hover:bg-muted",
            )}
          >
            {active && <Check className="size-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
