import { v1, strParam } from "@/lib/api-v1";
import { getPercentilePlacement } from "@/lib/repos/rate-signals";

export const dynamic = "force-dynamic";

/** GET /api/v1/rates/placement?payer=Aetna&code=90837&tin=123456789
 *  Where one billing group's published rate sits in the NY band for that
 *  payer+code. Null when the band has too few clinicians to be meaningful. */
export const GET = v1(async (req) => {
  const payer = strParam(req, "payer");
  const code = strParam(req, "code", 5);
  const tin = strParam(req, "tin", 20);
  const placement = await getPercentilePlacement(payer, code, tin);
  return { payer, code, tin, placement };
});
