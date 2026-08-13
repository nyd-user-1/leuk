import { EmptyState } from "@/components/ui/empty-state";
import { listAppointments } from "@/lib/repos/appointments";
import { authorNames } from "@/lib/repos/notes";
import { listLocations, listServices } from "@/lib/repos/services";
import { requirePortalClient } from "../data";
import { AppointmentsList, type PortalAppointment } from "./appointments-list";

// Portal Appointments — upcoming / past tabs; telehealth rows get a
// "Join video call" action into /portal/call/{room}.

export const dynamic = "force-dynamic";

export default async function PortalAppointmentsPage() {
  const { client } = await requirePortalClient();
  if (!client) {
    return (
      <>
        <EmptyState icon="calendar-check" title="No client record is linked to this login" />
      </>
    );
  }

  const [appointments, services, locations] = await Promise.all([
    listAppointments({ clientId: client.id }),
    listServices(),
    listLocations(),
  ]);
  const names = await authorNames([...new Set(appointments.map((a) => a.practitionerId))]);
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const locationById = new Map(locations.map((l) => [l.id, l]));

  const rows: PortalAppointment[] = appointments.map((a) => ({
    id: a.id,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    status: a.status,
    videoRoom: a.videoRoom,
    serviceId: a.serviceId,
    practitionerId: a.practitionerId,
    serviceName: serviceById.get(a.serviceId)?.name ?? "Appointment",
    practitionerName: names[a.practitionerId] ?? "Practitioner",
    locationName: a.locationId ? (locationById.get(a.locationId)?.name ?? null) : null,
  }));

  return (
    <>
      <AppointmentsList appointments={rows} bookHref={`/book/${client.primaryPractitionerId ?? "leuk"}`} />
    </>
  );
}
