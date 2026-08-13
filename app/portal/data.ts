import { redirect } from "next/navigation";
import { getUser, type SessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { FileAccess } from "@/lib/repos/files";
import { clientForUser } from "@/lib/repos/threads";
import type { Client } from "@/lib/types";

// Shared portal-page guard: signed-in client role + their client record
// (clients.user_id mapping — e.g. casey@leuk.demo → Casey Morgan).
// Practitioners/admins are bounced to their workspace by the root redirect.

export async function requirePortalClient(): Promise<{ user: SessionUser; client: Client | null }> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "client") redirect("/");
  const client = await clientForUser(user.id);
  return { user, client };
}

/**
 * A download-history row phrased for the person the records belong to. Both
 * portal surfaces that list documents show this, so the wording is decided
 * once here rather than drifting between them.
 *
 * Naming an unresolved actor "Your care team" is not a guess: the download
 * proxy serves a client's document to that client or to practice staff and
 * refuses everyone else, so an actor who is not this user is staff by
 * construction.
 */
export function portalFileAccess(
  access: FileAccess | undefined,
  viewerUserId: string,
): { who: string; detail: string } | null {
  if (!access) return null;
  return {
    who: access.lastById === viewerUserId ? "You" : (access.lastByName ?? "Your care team"),
    detail: `${access.downloads} download${access.downloads === 1 ? "" : "s"} · last ${formatDate(access.lastAt)}`,
  };
}
