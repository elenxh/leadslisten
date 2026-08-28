"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Zeitraum } from "@/lib/abrechnung";

export function ZeitraumWahl({
  zeitraeume,
  selectedKey,
}: {
  zeitraeume: Zeitraum[];
  selectedKey: string;
}) {
  const router = useRouter();
  return (
    <Select value={selectedKey} onValueChange={(v) => router.push(`/admin/abrechnung?zeitraum=${v}`)}>
      <SelectTrigger className="w-48" data-testid="zeitraum-select">
        <SelectValue>
          {(v: string) => zeitraeume.find((z) => z.key === v)?.label ?? "Zeitraum"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {zeitraeume.map((z) => (
          <SelectItem key={z.key} value={z.key}>{z.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
