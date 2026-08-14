#!/usr/bin/env node
// Enforce the MCP PHI boundary. Zero spend, no DB, no network.
//
// The MCP server at /api/mcp is UNAUTHENTICATED and reachable by any model on
// the internet, which makes "what code can it run" the only thing standing
// between a public directory and a HIPAA database. Reference data lives in
// `sql` (DATABASE_URL); PHI lives in `sqlPhi` (DATABASE_URL_PHI) — separate
// Postgres projects, no joins possible.
//
// Sibling of check-v1-boundary.mjs and the same idea, with one difference that
// matters: v1 is read-only, so its rule is "nothing may touch sqlPhi". MCP has
// exactly one write (booking, which creates a client and an appointment), so
// the rule here is:
//
//   1. lib/mcp/tools.ts and the route may not import any PHI-touching symbol.
//   2. lib/mcp/booking.ts is the ONE allowed exception, and it is checked for
//      the thing that would actually be dangerous: a PHI READ. It is allowed to
//      create a booking; it is not allowed to look anyone up.
//
// (2) is why booking goes through POST /api/book over HTTP rather than
// importing createAppointment — this file can then assert that lib/mcp imports
// no PHI symbol at all, which is a much stronger claim than "it imports the
// right ones".

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const MCP_DIRS = [join(ROOT, "lib/mcp"), join(ROOT, "app/api/mcp")];

const PHI_ONLY_MODULES = [
  "clients", "notes", "threads", "appointments", "invoices",
  "forms", "files", "policies", "orders", "prescriptions",
];

/** booking.ts may import from lib/booking + lib/repos/services (reference). */
const WRITE_LANE = "lib/mcp/booking.ts";

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Comments discuss `sqlPhi` at length in this lane — that is the design being
 *  documented, not a violation. Strip them before looking for real references. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function imports(src) {
  const out = [];
  const re = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    out.push({ names, from: m[2] });
  }
  return out;
}

/** Same conservative slice as the v1 checker: header → next top-level export.
 *  Can false-positive on a trailing private helper, never false-negative. */
function symbolTouchesPhi(src, fnName) {
  const header = new RegExp(`export\\s+(?:async\\s+)?function\\s+${fnName}\\b`);
  const start = src.search(header);
  if (start === -1) return false;
  const rest = src.slice(start);
  const nextExport = rest.slice(1).search(/\nexport\s/);
  const body = nextExport === -1 ? rest : rest.slice(0, nextExport + 1);
  return /\bsqlPhi\b/.test(stripComments(body));
}

const violations = [];
let symbolsChecked = 0;

for (const dir of MCP_DIRS) {
  for (const file of walk(dir)) {
    const rel = file.slice(ROOT.length + 1);
    const src = readFileSync(file, "utf8");

    // No file in the MCP lane may reach the PHI database directly, write lane
    // included — the booking write is an HTTP call to /api/book on purpose.
    if (/\bsqlPhi\b/.test(stripComments(src))) {
      violations.push(`${rel}: references sqlPhi directly`);
    }

    for (const { names, from } of imports(src)) {
      const repo = from.match(/^@\/lib\/repos\/(.+)$/);
      if (!repo) continue;
      const mod = repo[1];

      if (PHI_ONLY_MODULES.includes(mod)) {
        violations.push(`${rel}: imports PHI-only module lib/repos/${mod}`);
        continue;
      }

      let repoSrc;
      try {
        repoSrc = readFileSync(join(ROOT, "lib/repos", `${mod}.ts`), "utf8");
      } catch {
        violations.push(`${rel}: imports lib/repos/${mod}, which does not exist`);
        continue;
      }

      for (const name of names) {
        symbolsChecked++;
        if (symbolTouchesPhi(repoSrc, name)) {
          violations.push(`${rel}: ${name}() from lib/repos/${mod} reads sqlPhi (PHI)`);
        }
      }
    }
  }
}

// The write lane has to exist and has to stay the only one. A second file
// posting to /api/book would be a booking path nobody is reviewing.
const writers = MCP_DIRS.flatMap(walk)
  .map((f) => f.slice(ROOT.length + 1))
  .filter((rel) => /\/api\/book\b/.test(stripComments(readFileSync(join(ROOT, rel), "utf8"))));
for (const w of writers) {
  if (w !== WRITE_LANE) violations.push(`${w}: posts to /api/book; the write lane is ${WRITE_LANE} alone`);
}

if (violations.length) {
  console.error("FAIL — MCP PHI boundary violated:\n");
  for (const v of violations) console.error("  " + v);
  console.error(
    `\n${violations.length} violation(s). /api/mcp is unauthenticated and internet-reachable; it must never read the HIPAA database.`,
  );
  process.exit(1);
}

console.log(
  `OK — MCP boundary holds. ${symbolsChecked} imported repo symbol(s) checked, none read sqlPhi; write lane is ${WRITE_LANE} alone.`,
);
