"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Download,
  Folder,
  FolderPlus,
  Loader2,
  Pencil,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import {
  DATEIEN_BUCKET,
  MAX_DATEI_BYTES,
  formatBytes,
  typErlaubt,
} from "@/lib/dateien";
import type { SlDatei, SlOrdner } from "@/lib/types";
import {
  benenneOrdnerUm,
  erstelleDownloadUrl,
  erstelleOrdner,
  erstelleUploadUrl,
  loescheDatei,
  loescheOrdner,
  registriereDatei,
} from "./dateien-actions";

export function DateienBereich({
  leitungId,
  ordner,
  dateien,
}: {
  leitungId: string;
  ordner: SlOrdner[];
  dateien: SlDatei[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [aktuell, setAktuell] = useState<string | null>(null); // aktueller Ordner (null = Wurzel)
  const [dragOver, setDragOver] = useState(false);
  const [neuerOrdner, setNeuerOrdner] = useState("");
  const [pendingOrdner, startOrdner] = useTransition();
  const [uploads, setUploads] = useState<{ total: number; fertig: number; name: string } | null>(null);

  const ordnerMap = useMemo(() => new Map(ordner.map((o) => [o.id, o])), [ordner]);

  // Breadcrumb: aktuellen Pfad von der Wurzel aus aufbauen.
  const pfad = useMemo(() => {
    const kette: SlOrdner[] = [];
    let id = aktuell;
    while (id) {
      const o = ordnerMap.get(id);
      if (!o) break;
      kette.unshift(o);
      id = o.parent_id;
    }
    return kette;
  }, [aktuell, ordnerMap]);

  const unterordner = ordner
    .filter((o) => o.parent_id === aktuell)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const dateienHier = dateien
    .filter((d) => (d.ordner_id ?? null) === aktuell)
    .sort((a, b) => a.dateiname.localeCompare(b.dateiname, "de"));

  async function uploadDateien(files: FileList | File[]) {
    const liste = Array.from(files);
    if (liste.length === 0) return;
    const supabase = createClient();
    let fertig = 0;
    for (const file of liste) {
      setUploads({ total: liste.length, fertig, name: file.name });
      if (file.size > MAX_DATEI_BYTES) {
        toast.error(`„${file.name}" ist zu groß (max. 20 MB).`);
        fertig++;
        continue;
      }
      if (!typErlaubt(file.type, file.name)) {
        toast.error(`„${file.name}": Dateityp nicht erlaubt.`);
        fertig++;
        continue;
      }
      const urlRes = await erstelleUploadUrl(leitungId, file.name, file.size, file.type || null);
      if (!urlRes.ok) {
        toast.error(`„${file.name}" nicht hochgeladen`, { description: urlRes.error });
        fertig++;
        continue;
      }
      const { error } = await supabase.storage
        .from(DATEIEN_BUCKET)
        .uploadToSignedUrl(urlRes.path, urlRes.token, file);
      if (error) {
        toast.error(`„${file.name}" nicht hochgeladen`, { description: error.message });
        fertig++;
        continue;
      }
      const reg = await registriereDatei({
        leitungId,
        ordnerId: aktuell,
        dateiname: file.name,
        storagePfad: urlRes.path,
        groesse: file.size,
        mimeType: file.type || null,
      });
      if (!reg.ok) {
        toast.error(`„${file.name}" nicht gespeichert`, { description: reg.error });
      }
      fertig++;
      setUploads({ total: liste.length, fertig, name: file.name });
    }
    setUploads(null);
    toast.success("Upload abgeschlossen");
    router.refresh();
  }

  function ordnerAnlegen() {
    const name = neuerOrdner.trim();
    if (!name) return;
    startOrdner(async () => {
      const res = await erstelleOrdner(leitungId, aktuell, name);
      if (!res.ok) { toast.error("Ordner nicht angelegt", { description: res.error }); return; }
      setNeuerOrdner("");
      router.refresh();
    });
  }

  return (
    <section className="space-y-3" id="dateien" data-testid="dateien-bereich">
      <div>
        <h2 className="text-lg font-semibold">Dateien</h2>
        <p className="text-sm text-muted-foreground">
          Dokumente & Flyer — privat, max. 20 MB pro Datei.
        </p>
      </div>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => setAktuell(null)}
          className={cn("rounded px-1.5 py-0.5 hover:bg-muted", aktuell === null && "font-medium")}
          data-testid="crumb-root"
        >
          Start
        </button>
        {pfad.map((o) => (
          <span key={o.id} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setAktuell(o.id)}
              className={cn("rounded px-1.5 py-0.5 hover:bg-muted", aktuell === o.id && "font-medium")}
            >
              {o.name}
            </button>
          </span>
        ))}
      </div>

      {/* Upload-Dropzone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) uploadDateien(e.dataTransfer.files); }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
        )}
        data-testid="dateien-dropzone"
      >
        {uploads ? (
          <>
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium">Lädt hoch… {uploads.fertig}/{uploads.total}</p>
            <p className="max-w-full truncate text-xs text-muted-foreground">{uploads.name}</p>
          </>
        ) : (
          <>
            <UploadCloud className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Dateien hierher ziehen oder klicken</p>
            <p className="text-xs text-muted-foreground">PDF, Office, Bilder, Text · max. 20 MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          data-testid="dateien-input"
          onChange={(e) => { if (e.target.files?.length) uploadDateien(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* Neuer Ordner */}
      <div className="flex items-center gap-2">
        <Input
          value={neuerOrdner}
          onChange={(e) => setNeuerOrdner(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ordnerAnlegen(); }}
          placeholder="Neuer Ordner…"
          className="h-8 max-w-xs text-sm"
          data-testid="ordner-name"
        />
        <Button size="sm" variant="outline" onClick={ordnerAnlegen} disabled={pendingOrdner || !neuerOrdner.trim()} data-testid="ordner-anlegen">
          {pendingOrdner ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FolderPlus className="mr-1.5 size-4" />}
          Ordner
        </Button>
      </div>

      {/* Inhalt: Unterordner + Dateien */}
      <div className="divide-y rounded-lg border">
        {unterordner.length === 0 && dateienHier.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Leer.</p>
        )}
        {unterordner.map((o) => (
          <OrdnerZeile
            key={o.id}
            o={o}
            kinder={ordner.filter((x) => x.parent_id === o.id).length}
            dateiCount={dateien.filter((d) => d.ordner_id === o.id).length}
            onOpen={() => setAktuell(o.id)}
          />
        ))}
        {dateienHier.map((d) => (
          <DateiZeile key={d.id} d={d} />
        ))}
      </div>
    </section>
  );
}

function OrdnerZeile({
  o,
  kinder,
  dateiCount,
  onOpen,
}: {
  o: SlOrdner;
  kinder: number;
  dateiCount: number;
  onOpen: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [umbenennen, setUmbenennen] = useState(false);
  const [name, setName] = useState(o.name);

  function speichern() {
    start(async () => {
      const res = await benenneOrdnerUm(o.id, name);
      if (!res.ok) { toast.error("Nicht umbenannt", { description: res.error }); return; }
      setUmbenennen(false);
      router.refresh();
    });
  }
  function loeschen() {
    const inhalt = kinder + dateiCount;
    const frage = inhalt > 0
      ? `„${o.name}" enthält ${kinder} Unterordner und ${dateiCount} Dateien. Wirklich mit gesamtem Inhalt löschen?`
      : `Ordner „${o.name}" löschen?`;
    if (!window.confirm(frage)) return;
    start(async () => {
      const res = await loescheOrdner(o.id);
      if (!res.ok) { toast.error("Nicht gelöscht", { description: res.error }); return; }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {umbenennen ? (
        <>
          <Folder className="size-4 shrink-0 text-muted-foreground" />
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 max-w-xs text-sm" autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") speichern(); if (e.key === "Escape") setUmbenennen(false); }} />
          <Button size="sm" onClick={speichern} disabled={pending || !name.trim()}>Speichern</Button>
          <Button size="sm" variant="ghost" onClick={() => { setName(o.name); setUmbenennen(false); }}>Abbrechen</Button>
        </>
      ) : (
        <>
          <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left" data-testid="ordner-oeffnen">
            <Folder className="size-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-medium">{o.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {kinder + dateiCount > 0 ? `${kinder + dateiCount} Einträge` : "leer"}
            </span>
          </button>
          <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Umbenennen" onClick={() => setUmbenennen(true)} disabled={pending}>
            <Pencil className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" aria-label="Löschen" onClick={loeschen} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </Button>
        </>
      )}
    </div>
  );
}

function DateiZeile({ d }: { d: SlDatei }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function download() {
    start(async () => {
      const res = await erstelleDownloadUrl(d.id);
      if (!res.ok) { toast.error("Download fehlgeschlagen", { description: res.error }); return; }
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }
  function loeschen() {
    if (!window.confirm(`Datei „${d.dateiname}" löschen?`)) return;
    start(async () => {
      const res = await loescheDatei(d.id);
      if (!res.ok) { toast.error("Nicht gelöscht", { description: res.error }); return; }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2" data-testid="datei-zeile">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{d.dateiname}</p>
        <p className="text-xs text-muted-foreground">
          {formatBytes(d.groesse)} · {formatDate(d.erstellt_am)}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Download" onClick={download} disabled={pending} data-testid="datei-download">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" aria-label="Löschen" onClick={loeschen} disabled={pending} data-testid="datei-delete">
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
