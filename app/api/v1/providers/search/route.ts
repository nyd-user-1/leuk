import { v1, optParam, intParam } from "@/lib/api-v1";
import { searchProviders } from "@/lib/repos/directory";

export const dynamic = "force-dynamic";

/** GET /api/v1/providers/search?q=&city=&county=&profession=&insurancePayer=&pageSize=
 *  The NY behavioral-health provider directory (NPPES + NY Medicaid). */
export const GET = v1(async (req) => {
  const page = await searchProviders({
    q: optParam(req, "q"),
    city: optParam(req, "city"),
    county: optParam(req, "county"),
    profession: optParam(req, "profession"),
    subspecialty: optParam(req, "subspecialty"),
    providerType: optParam(req, "providerType", 20),
    insurancePayer: optParam(req, "insurancePayer"),
    page: intParam(req, "page", 1, 200),
    pageSize: intParam(req, "pageSize", 20, 50),
  });
  return page;
});
