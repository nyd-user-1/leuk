import { v1, codesParam, intParam } from "@/lib/api-v1";
import { getRateBands } from "@/lib/repos/rate-signals";

export const dynamic = "force-dynamic";

/** GET /api/v1/rates/bands?codes=90837,90834&minClinicians=3
 *  Per-payer p25/median/p75 for NY, from the payers' published machine-readable
 *  files. Public record, not PHI. */
export const GET = v1(async (req) => {
  const codes = codesParam(req);
  const minClinicians = intParam(req, "minClinicians", 3, 50);
  const bands = await getRateBands(codes, { minClinicians });
  return { codes, minClinicians, bands };
});
