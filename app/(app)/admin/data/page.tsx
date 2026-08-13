import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { adminPageData } from "@/lib/repos/admin";
import { AdminDataTabs } from "./admin-data-tabs";

// Founder-only live data dictionary + Insurers board (docs/TASK-ERD-PAGE.md).
// No logEvent: aggregate counts only, never a PHI read. Thin server page;
// real content in the client component (Table needs a "use client"
// boundary). Both tabs' data comes from one adminPageData() call — one query
// flight, memoized 60s — so switching tabs never re-fetches.
export const dynamic = "force-dynamic";

export default async function AdminDataPage() {
  const user = await requireUser();
  if (user.email !== "brendan@leuk.demo") notFound();

  const { groups, insurers } = await adminPageData();
  return <AdminDataTabs groups={groups} insurers={insurers} />;
}
