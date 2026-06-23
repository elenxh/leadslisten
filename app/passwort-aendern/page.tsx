import { requireLeitung } from "@/lib/auth";
import { PasswortForm } from "./passwort-form";

export const dynamic = "force-dynamic";

export default async function PasswortAendernPage() {
  const me = await requireLeitung();
  return <PasswortForm leitungId={me.id} forced={!me.passwort_geaendert} />;
}
