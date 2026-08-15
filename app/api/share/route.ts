import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/audit";
import { AuthError, requireUser } from "@/lib/auth";

// Share a draft to a chat workspace — Slack via chat.postMessage with a bot
// token, Discord via an incoming webhook. Server-side ONLY: both are bearer
// credentials, so neither reaches the browser or appears in a response body or
// a log line.
//
// ── The PHI rule, which is the whole reason this route exists ───────────────
// Neither destination is inside our BAA. Discord offers no BAA at all; Slack's
// is Enterprise Grid only. So a clinical draft — anything Friday produced,
// which is chart-derived by construction — CANNOT go out this pipe, and the
// route refuses it rather than trusting the caller's flag. Directory and rates
// answers are public reference data and are fine.
//
// This is a deliberate server-side veto: the client sends what it believes the
// source was, and the server independently refuses any PHI-capable source. If
// a future agent gains chart access, add it to PHI_SOURCES and the door shuts
// without touching the UI.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Agents whose answers may contain PHI. Never shareable off-platform. */
const PHI_SOURCES = new Set(["friday"]);

const LIMITS = { slack: 3000, discord: 1900 } as const;

type Target = keyof typeof LIMITS;

// Slack's "mrkdwn" is not markdown. Single asterisks bold, links are
// <url|label>, and headings don't exist. Convert the three constructs that
// actually appear in an answer and leave the rest alone.
//
// Tables go into a code fence: Slack renders no table, but a fenced block is
// monospaced, so the columns still line up and the row structure survives.
function toMrkdwn(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\|.*\|\s*$/.test(lines[i])) {
      const block: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) block.push(lines[i++]);
      i--;
      out.push("```", ...block, "```");
      continue;
    }
    out.push(lines[i]);
  }
  return out
    .join("\n")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*");
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { target, title, markdown, source } = (await req.json()) as {
      target?: string;
      title?: string;
      markdown?: string;
      source?: string;
    };

    if (!target || !(target in LIMITS)) {
      return NextResponse.json({ error: "Unknown destination." }, { status: 400 });
    }
    if (!markdown?.trim()) {
      return NextResponse.json({ error: "Nothing to share." }, { status: 400 });
    }
    if (source && PHI_SOURCES.has(source)) {
      return NextResponse.json(
        {
          error:
            "Clinical drafts can't be shared to Slack or Discord — neither is covered by our BAA. Export as PDF and send it through a covered channel instead.",
        },
        { status: 403 },
      );
    }

    const label = target === "slack" ? "Slack" : "Discord";
    const heading = title?.trim() || "Leuk draft";
    const raw = markdown.trim();
    const body = target === "slack" ? toMrkdwn(raw) : raw;
    // Truncate rather than let the far end reject the whole post, and say so in
    // the message so nobody reads a half table as the finding.
    const room = LIMITS[target as Target] - heading.length - 40;
    const text =
      body.length > room ? `${body.slice(0, room)}\n\n_…truncated. Full draft is in Leuk._` : body;

    if (target === "slack") {
      // Bot token, not an incoming webhook: one credential posts to any
      // channel, and it can be rotated or revoked. A webhook URL is a
      // permanent bearer credential scoped to exactly one channel.
      const token = process.env.SLACK_BOT_TOKEN;
      const channel = process.env.SLACK_CHANNEL;
      if (!token || !channel) {
        return NextResponse.json(
          { error: "Slack isn't connected yet — set SLACK_BOT_TOKEN and SLACK_CHANNEL." },
          { status: 501 },
        );
      }
      // Slack answers 200 even when it refuses; the verdict is in the body.
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel, text: `*${heading}*\n\n${text}`, mrkdwn: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json.ok) {
        const hint =
          json.error === "not_in_channel"
            ? " — invite the app to the channel (/invite @Leuk)."
            : json.error === "channel_not_found"
              ? " — SLACK_CHANNEL must be a channel ID like C0123456789."
              : "";
        return NextResponse.json({ error: `Slack refused: ${json.error ?? "unknown"}${hint}` }, { status: 502 });
      }
    } else {
      const url = process.env.DISCORD_WEBHOOK_URL;
      if (!url) {
        return NextResponse.json(
          { error: "Discord isn't connected yet — set DISCORD_WEBHOOK_URL." },
          { status: 501 },
        );
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `**${heading}**\n\n${text}` }),
      });
      if (!res.ok) {
        // The webhook URL must not travel in the error — it's the credential.
        return NextResponse.json({ error: `Discord rejected the message (${res.status}).` }, { status: 502 });
      }
    }

    // Title and destination only. The body may be commercially sensitive rate
    // data even when it isn't PHI, and an audit row is not the place for it.
    await logEvent({
      actorId: user.id,
      action: "share.export",
      entity: "document",
      entityId: target,
      meta: { destination: label, title: heading, chars: text.length },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not share the draft." }, { status: 500 });
  }
}
