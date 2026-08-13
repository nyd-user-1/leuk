import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireRole } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { getClient, setPhotonPatientId } from "@/lib/repos/clients";
import {
  PhotonError,
  createPhotonPatient,
  hasPhoton,
  parseAddress,
  toPhotonPhone,
  toPhotonSex,
} from "@/lib/photon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authResponse(e: unknown): NextResponse | null {
  return e instanceof AuthError ? NextResponse.json({ error: e.message }, { status: e.status }) : null;
}

/**
 * POST /api/photon/sync-patient — createPatient in Photon from a Leuk
 * clients row, storing the returned id on clients.photon_patient_id.
 * Idempotent: a client that already carries an id is a no-op.
 *
 * Body: { clientId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("practitioner");
    if (!hasPhoton) {
      return NextResponse.json({ error: "Photon is not configured on this server." }, { status: 503 });
    }
    const body = await req.json().catch(() => null);
    const clientId = typeof body?.clientId === "string" ? body.clientId : "";
    if (!clientId) return NextResponse.json({ error: "clientId is required." }, { status: 400 });

    const client = await getClient(clientId);
    if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
    if (client.photonPatientId) {
      return NextResponse.json({ patientId: client.photonPatientId, created: false });
    }

    // createPatient requires dateOfBirth, sex and phone — a client missing
    // either of the first two can't sync, and we say which rather than
    // letting Photon reject an incomplete mutation.
    const phone = toPhotonPhone(client.phone);
    const missing: string[] = [];
    if (!client.dob) missing.push("date of birth");
    if (!phone) missing.push("a valid phone number");
    if (missing.length) {
      return NextResponse.json(
        { error: `This client needs ${missing.join(" and ")} before syncing to Photon.` },
        { status: 422 },
      );
    }

    const patientId = await createPhotonPatient({
      externalId: client.id, // Leuk client id — the join back from webhooks
      name: { first: client.firstName, last: client.lastName },
      dateOfBirth: client.dob!,
      sex: toPhotonSex(client.gender),
      gender: client.gender,
      email: client.email,
      phone: phone!,
      address: parseAddress(client.address),
    });
    await setPhotonPatientId(client.id, patientId);
    await logEvent({
      actorId: user.id,
      action: "photon.patient.sync",
      entity: "client",
      entityId: client.id,
      meta: { photonPatientId: patientId },
    });
    return NextResponse.json({ patientId, created: true });
  } catch (e) {
    const res = authResponse(e);
    if (res) return res;
    if (e instanceof PhotonError) {
      return NextResponse.json({ error: e.message, stage: e.stage }, { status: 502 });
    }
    throw e;
  }
}
