import { appBaseUrl } from "@/lib/email";

/**
 * /.well-known/mcp.json — the MCP server card.
 *
 * Leuk runs a real MCP server at /api/mcp (app/api/mcp/route.ts): nine tools
 * over the New York clinician directory, the OMH program registry, payer
 * network participation, and this practice's own booking.
 *
 * This card exists so an agent can DISCOVER that without being told. The route
 * is the implementation and this is the advertisement; if they ever disagree,
 * the route wins and this file is the bug.
 *
 * `authentication` is absent on purpose. The server is authless — everything it
 * reads is public record and the one write is the same booking the public form
 * accepts — and per the rule this card inherits from 44b, advertising an auth
 * scheme we do not run would be worse than saying nothing.
 */

export const dynamic = "force-dynamic";

const TOOLS: [string, string][] = [
  ["find_providers", "Search ~116,000 licensed New York mental-health clinicians by location, profession, subspecialty and insurance."],
  ["get_provider", "One clinician in full, including every insurer that lists them and whether the panel is open."],
  ["find_programs", "New York State OMH treatment programs — outpatient, IOP, PHP, ACT, residential, crisis."],
  ["find_resources", "NYC community resources: drop-in centres, peer support, clubhouses, family services."],
  ["get_program", "Full record for one program or resource."],
  ["directory_filters", "Valid values for every filter — counties, cities, professions, subspecialties, payer slugs."],
  ["list_bookable", "The practice's own practitioners and bookable services."],
  ["get_availability", "Real open appointment times for a practitioner, service and date."],
  ["book_appointment", "Book an appointment with the practice and email a confirmation."],
];

export function GET() {
  const site = appBaseUrl();
  return Response.json(
    {
      name: "Leuk",
      description:
        "Find mental-health care in New York: ~116,000 licensed clinicians, OMH treatment programs, " +
        "NYC community resources, and payer-published network participation — then book an appointment.",
      version: "1.0.0",
      documentationUrl: `${site}/directory`,
      iconUrl: `${site}/apple-icon.png`,
      icons: [{ src: `${site}/apple-icon.png`, mimeType: "image/png", sizes: ["180x180"] }],
      remotes: [
        {
          type: "streamable-http",
          url: `${site}/api/mcp`,
          transport: "streamable-http",
        },
      ],
      capabilities: { tools: true, resources: false, prompts: false, sampling: false },
      tools: TOOLS.map(([name, description]) => ({ name, description })),
    },
    { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } },
  );
}
