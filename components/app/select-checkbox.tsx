"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Schlanke Checkbox auf Basis eines nativen Inputs.
 * `stopOnClick` verhindert, dass der Klick zum umschließenden Link (Karte/
 * Zeile) durchschlägt – die Checkbox toggelt, navigiert aber nicht.
 */
export function SelectCheckbox({
  checked,
  onCheckedChange,
  indeterminate = false,
  stopOnClick = false,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  indeterminate?: boolean;
  stopOnClick?: boolean;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={(e) => onCheckedChange(e.target.checked)}
      onClick={stopOnClick ? (e) => e.stopPropagation() : undefined}
      className={cn(
        "size-4 shrink-0 cursor-pointer accent-primary",
        className,
      )}
    />
  );
}
