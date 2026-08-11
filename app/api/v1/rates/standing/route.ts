import { v1, npiParam } from "@/lib/api-v1";
import { getStanding } from "@/lib/repos/rate-signals";

export const dynamic = "force-dynamic";

/** GET /api/v1/rates/standing?npi=1234567890
 *  What the payers publish that they pay this NPI, grouped by billing group. */
export const GET = v1(async (req) => {
  const npi = npiParam(req);
  return { npi, standing: await getStanding(npi) };
});
