import { getUser } from "@/lib/auth";
import { TemplatesIndex } from "./templates-client";

// Templates — note-template gallery (Notes tab) + form templates (Forms tab).
// The admin (Brendan) additionally sees an Operations section of governance docs.

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await getUser();
  return <TemplatesIndex isAdmin={user?.role === "admin"} />;
}
