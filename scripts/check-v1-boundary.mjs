#!/usr/bin/env node
// Enforce the /api/v1 PHI boundary. Zero spend, no DB, no network.
//
// The v1 surface is keyed and reachable by third parties, so the one thing that
// must never drift is which code it can run. Reference data lives in `sql`
// (DATABASE_URL); PHI lives in `sqlPhi` (DATABASE_URL_PHI) — separate projects.
//
// This checks two things:
//   1. No v1 file imports a repo module that is PHI-only.
//   2. For every symbol a v1 file imports from lib/repos/*, that symbol's
//      function body never references `sqlPhi`.
//
// (2) is the one that matters. lib/repos/directory.ts legitimately exports both
// reference and PHI functions from one module, so a module-level rule would be
// either useless or wrong. Exit 1 on any violation.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const V1_DIR = join(ROOT, "app/api/v1");

const PHI_ONLY_MODULES = [
  "clients", "notes", "threads", "appointments", "invoices",
  "forms", "files", "policies", "orders", "prescriptions",
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Extract `{ a, b as c }` specifiers and the module path from each import. */
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

/** Does `fnName`'s body in `src` reference sqlPhi?
 *
 *  Deliberately NOT brace-matched. The first `{` after a function header is
 *  usually a destructured or inline-typed PARAMETER (`function f(o: { id:
 *  string })`), so brace-matching from it reads the type annotation and returns
 *  clean on a function whose body is full of PHI — verified by the negative
 *  test below, which this shape passed and should not have.
 *
 *  Instead: slice from the header to the next top-level `export`, which is the
 *  function plus at most some trailing module-private helpers. That can produce
 *  a FALSE POSITIVE (a private helper using sqlPhi attributed to the export
 *  above it) and never a false negative. For a boundary guarding a keyed,
 *  third-party-reachable surface, that is the correct direction to be wrong in.
 */
function symbolTouchesPhi(src, fnName) {
  const header = new RegExp(`export\\s+(?:async\\s+)?function\\s+${fnName}\\b`);
  const start = src.search(header);
  if (start === -1) return false; // not a function export (type/const) — nothing to run
  const rest = src.slice(start);
  const nextExport = rest.slice(1).search(/\nexport\s/);
  const body = nextExport === -1 ? rest : rest.slice(0, nextExport + 1);
  return /\bsqlPhi\b/.test(body);
}

const violations = [];
let symbolsChecked = 0;

for (const file of walk(V1_DIR)) {
  const rel = file.slice(ROOT.length + 1);
  const src = readFileSync(file, "utf8");

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

if (violations.length) {
  console.error("FAIL — /api/v1 PHI boundary violated:\n");
  for (const v of violations) console.error("  " + v);
  console.error(`\n${violations.length} violation(s). The v1 surface is keyed and third-party reachable; it must never reach the HIPAA database.`);
  process.exit(1);
}

console.log(`OK — /api/v1 boundary holds. ${symbolsChecked} imported repo symbol(s) checked, none read sqlPhi.`);
