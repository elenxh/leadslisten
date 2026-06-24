"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  parseArrayBuffer,
  deriveOrtUndRing,
  type ParsedWorkbook,
  type RawSchule,
} from "@/lib/excel-import";
import { importSchulen, type ImportResult } from "./actions";
import type { Leitung } from "@/lib/types";

const UNASSIGNED = "__none__";

export function ImportClient({
  leitungen,
}: {
  leitungen: Pick<Leitung, "id" | "name" | "kuerzel" | "farbe">[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [zustaendig, setZustaendig] = useState<string>(UNASSIGNED);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  const allRows: RawSchule[] = parsed
    ? parsed.sheets.flatMap((s) => s.schulen)
    : [];

  async function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    setParsed(null);
    if (!/\.xlsx?$/i.test(file.name)) {
      setParseError("Bitte eine .xlsx-Datei wählen.");
      return;
    }
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = parseArrayBuffer(buf);
      if (wb.total === 0) {
        setParseError(
          "Keine Schulen erkannt. Erwartet: Daten ab Zeile 4, Spalten A–I.",
        );
        return;
      }
      setParsed(wb);
    } catch (e) {
      setParseError(`Datei konnte nicht gelesen werden: ${(e as Error).message}`);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function reset() {
    setFileName(null);
    setParsed(null);
    setParseError(null);
    setResult(null);
    setZustaendig(UNASSIGNED);
    if (inputRef.current) inputRef.current.value = "";
  }

  function runImport() {
    if (!parsed) return;
    startTransition(async () => {
      const res = await importSchulen({
        rows: allRows,
        zustaendigId: zustaendig === UNASSIGNED ? null : zustaendig,
      });
      setResult(res);
      if (res.ok) {
        toast.success(
          `${res.created} neu, ${res.updated} aktualisiert`,
        );
        router.refresh();
      } else {
        toast.error("Import fehlgeschlagen", { description: res.error });
      }
    });
  }

  // Erfolgs-Ansicht
  if (result?.ok) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <CheckCircle2 className="size-12 text-emerald-500" />
            <h2 className="text-lg font-semibold">Import abgeschlossen</h2>
            <p className="text-sm text-muted-foreground">
              <strong>{result.created}</strong> neue Schulen angelegt,{" "}
              <strong>{result.updated}</strong> aktualisiert
              {result.skipped > 0 && (
                <>
                  , <strong>{result.skipped}</strong> Duplikate in der Datei
                  übersprungen
                </>
              )}
              .
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={reset}>
                Weitere Datei importieren
              </Button>
              <Button onClick={() => router.push("/dashboard")}>
                Zum Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-5">
      <div>
        <h1 className="text-xl font-semibold">Schulen importieren</h1>
        <p className="text-sm text-muted-foreground">
          Excel im Lilly-Format (.xlsx). Daten ab Zeile 4, Spalten A–I; mehrere
          Sheets je Schulart werden zusammengeführt.
        </p>
      </div>

      {/* Drop-Zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
        }`}
      >
        <UploadCloud className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">
          {fileName ? fileName : "Datei hierher ziehen oder klicken"}
        </p>
        <p className="text-xs text-muted-foreground">Nur .xlsx</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>

      {parseError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {parseError}
        </p>
      )}

      {parsed && (
        <>
          {/* Sheet-Übersicht */}
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {parsed.total} Schulen erkannt:
            </span>
            {parsed.sheets.map((s) => (
              <Badge key={s.sheet} variant="secondary">
                {s.sheet}: {s.schulen.length}
              </Badge>
            ))}
          </div>

          {/* Preview-Tabelle (erste 10) */}
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Schule</th>
                    <th className="px-3 py-2 font-medium">Stadt</th>
                    <th className="px-3 py-2 font-medium">Ring</th>
                    <th className="px-3 py-2 font-medium">Schulart</th>
                    <th className="px-3 py-2 font-medium">Ansprechpartner</th>
                    <th className="px-3 py-2 font-medium">Telefon</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.slice(0, 10).map((r, i) => {
                    const { stadt, ring } = deriveOrtUndRing(r.bezirk);
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.bezirk ?? "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2">{stadt ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {ring == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            `Ring ${ring}`
                          )}
                        </td>
                        <td className="px-3 py-2">{r.schulart ?? "—"}</td>
                        <td className="px-3 py-2">{r.ansprechpartner ?? "—"}</td>
                        <td className="px-3 py-2">{r.tel ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {parsed.total > 10 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  … und {parsed.total - 10} weitere
                </p>
              )}
            </CardContent>
          </Card>

          {/* Zuweisung + Import */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2 sm:max-w-xs sm:flex-1">
              <Label>Zuständige Leitung (nur für neue Schulen)</Label>
              <Select
                value={zustaendig}
                onValueChange={(v) => setZustaendig((v as string) ?? UNASSIGNED)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Nicht zuweisen</SelectItem>
                  {leitungen.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} disabled={pending}>
                Abbrechen
              </Button>
              <Button onClick={runImport} disabled={pending}>
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {parsed.total} Schulen importieren
              </Button>
            </div>
          </div>

          {result && !result.ok && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {result.error}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Hinweis: Bestehende Schulen (Name + Bezirk) werden nur in den
            Stammdaten aktualisiert. Status, Wiedervorlage, Akquise-Notiz und
            bestehende Zuständigkeit bleiben unverändert.
          </p>
        </>
      )}
    </div>
  );
}
