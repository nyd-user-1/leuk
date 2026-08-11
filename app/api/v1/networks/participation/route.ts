import { v1, npiParam } from "@/lib/api-v1";
import { networkParticipationForNpi } from "@/lib/repos/networks";

export const dynamic = "force-dynamic";

/** GET /api/v1/networks/participation?npi=1234567890
 *  Every payer network this NPI is listed in, with the payer's own as-of date
 *  and whether that payer publishes an accepting-new-patients flag. */
export const GET = v1(async (req) => {
  const npi = npiParam(req);
  return { npi, participation: await networkParticipationForNpi(npi) };
});
