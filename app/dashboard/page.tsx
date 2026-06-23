import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { requireLeitung } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SchuleMitLeitung } from "@/lib/types";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const me = await requireLeitung();

  if (!me.passwort_geaendert) {
    redirect("/passwort-aendern");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schulen")
    .select(
      "*, leitung:zustaendig(id, name, kuerzel, farbe)",
    )
    .order("naechster_anruf", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  const schulen = (data ?? []) as unknown as SchuleMitLeitung[];

  return (
    <>
      <AppHeader leitung={me} />
      {error ? (
        <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-destructive">
          Schulen konnten nicht geladen werden: {error.message}
        </div>
      ) : (
        <DashboardClient schulen={schulen} me={me} />
      )}
    </>
  );
}
