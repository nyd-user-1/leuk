// The local-tools gate.
//
// A handful of surfaces read files off the developer's disk — agent identity
// files under ~/.claude/agents, the docs/ tree, the rules markdown. They exist
// for one person on one laptop: the "Agents, Reports, and Rules" section of the
// Workspace board, /workspace/docs, and the two schema pages.
//
// They have no business in a deployed build, for three reasons that stack:
//
//   1. They cannot work. A container has no ~/.claude and, once we stop
//      shipping docs/, no docs tree either. They would 500, not degrade.
//   2. Shipping them means putting 18 MB of handoff memos, recon reports, the
//      Database Atlas and payer research inside a production image — internal
//      business intelligence travelling somewhere it is never read.
//   3. They are admin-gated, which protects them from strangers but not from
//      being the widest thing an admin session can reach.
//
// So the rule is environment, not role: available where the files are, absent
// everywhere else. `LEUK_LOCAL_TOOLS=1` is the deliberate override for the day
// someone wants them on a staging box with a docs volume mounted — an explicit
// opt-in, never a default.
//
// This is NOT a security boundary. requireRole("admin") still guards every one
// of these routes and stays there. This is about not deploying a local tool.

export function localToolsEnabled(): boolean {
  if (process.env.LEUK_LOCAL_TOOLS === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/** The 404 a disabled local tool returns. Says why, so it isn't a mystery. */
export function localToolsDisabled(): Response {
  return Response.json(
    {
      error: "not_available",
      message:
        "This is a local development tool and is not available in a deployed build. Run it against a dev server.",
    },
    { status: 404 },
  );
}
