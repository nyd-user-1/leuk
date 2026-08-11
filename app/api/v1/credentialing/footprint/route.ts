import { v1, npiParam } from "@/lib/api-v1";
import { getCredentialingFootprint } from "@/lib/repos/rate-signals";

export const dynamic = "force-dynamic";

/** GET /api/v1/credentialing/footprint?npi=1234567890
 *  Which payer books this NPI appears in, under which billing groups, and
 *  which checked books it is absent from. Sourced from payers' own published
 *  directories; "listed" is not the same claim as "in-network". */
export const GET = v1(async (req) => {
  const npi = npiParam(req);
  return { npi, footprint: await getCredentialingFootprint(npi) };
});
