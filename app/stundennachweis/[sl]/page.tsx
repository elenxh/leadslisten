import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

import { AppHeader } from "@/components/app/app-header";
import { Card } from "@/components/ui/card";
import { isAdmin, requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { zeitraumListe } from "@/lib/abrechnung";

export const dynamic = "force-dynamic";

export default async function OrdnerPage({
  params,
}: {
  params: { sl: string };
}) {
  const me = await requireLeitung();
  const admin = isAdmin(me);
  if (!admin && me.id !== params.sl) {
    redirect(`/stundennachweis/${me.id}`);
  }

  const supabase = await createClient();
  const { data: sl } = await supabase
    .from("leitungen")
    .select("id, name")
    .eq("id", params.sl)
    .maybeSingle();
  if (!sl) notFound();

  const zeitraeume = zeitraumListe(todayISO(), 11);

  return (
    <>
      <AppHeader leitung={me} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {admin && (
          <Link
            href="/stundennachweis"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Alle Standortleitungen
          </Link>
        )}
        <div className="mb-4">
          <h1 className="text-lg font-semibold">{(sl as { name: string }).name}</h1>
          <p className="text-sm text-muted-foreground">
            Monatsseiten (Abrechnungszeitraum 26.–25.)
          </p>
        </div>
        <ul className="space-y-2">
          {zeitraeume.map((z) => (
            <li key={z.key}>
              <Card className="p-0">
                <Link
                  href={`/stundennachweis/${params.sl}/${z.key}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                >
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {z.label}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
