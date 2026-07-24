import { NextResponse, type NextRequest } from "next/server";
import { getUserByToken, SESSION_COOKIE } from "@/lib/auth";

// Runs before the (app)/(portal) layouts' own getUser()+redirect, so an
// expired/missing session bounces to /sign-in as the very first thing that
// happens on the request — no render, no chance for a page's OWN redundant
// requireUser() call (several pages under workspace/ have one) to win the
// race and throw an uncaught AuthError instead of the layout's clean
// redirect. Needs the Node runtime: lib/auth.ts uses node:crypto and the
// Neon driver, neither of which the default Edge runtime provides.
export const runtime = "nodejs";

export default async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getUserByToken(token);
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  // Mirrors (app)/layout.tsx: clients only ever get the portal shell.
  const isPortalPath = request.nextUrl.pathname.startsWith("/portal");
  if (user.role === "client" && !isPortalPath) {
    return NextResponse.redirect(new URL("/portal", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // The (app) group's own top-level segments. Safe to wildcard — none of
    // these names collide with a root-level (public) route.
    "/admin/:path*",
    "/analytics/:path*",
    "/calendar/:path*",
    "/calls/:path*",
    "/catalog/:path*",
    "/chat/:path*",
    "/clients/:path*",
    "/codes/:path*",
    "/dashboard/:path*",
    "/design-system/:path*",
    "/directory/:path*",
    "/earnings/:path*",
    "/inbox/:path*",
    "/insights/:path*",
    "/library/:path*",
    "/maps/:path*",
    "/monitor/:path*",
    "/networks/:path*",
    "/orders/:path*",
    "/orgs/:path*",
    "/plans/:path*",
    "/prescriptions/:path*",
    "/programs/:path*",
    "/published-rates/:path*",
    "/settings/:path*",
    "/workspace/:path*",
    // Client portal — same layout-level guard, same race.
    "/portal/:path*",
    // billing/rates/recruiting also exist as ROOT (public) routes one level
    // deeper (e.g. /billing/[id]/print, /rates/card, /recruiting/print) —
    // matched exactly, no wildcard, so those public sub-paths stay open.
    "/billing",
    "/billing/:id",
    "/rates",
    "/recruiting",
  ],
};
