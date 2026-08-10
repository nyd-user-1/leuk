import { Tabs } from "@/components/ui/tabs";

// Settings section — route-linked Tabs (Services / Locations / Availability),
// matching the other portal index pages (Inbox, Clients, Directory) which sit a
// tab bar under a constant TopBar title. Each tab is a sub-route; Tabs marks the
// active one via pathname. The bare /settings route redirects to the first tab.
const SETTINGS_TABS = [
  { key: "services", label: "Services", href: "/settings/services" },
  { key: "locations", label: "Locations", href: "/settings/locations" },
  { key: "availability", label: "Availability", href: "/settings/availability" },
  // Route is /settings/payments (what the Connect return URLs and the payout
  // emails link to); the tab label is "Finance".
  { key: "payments", label: "Finance", href: "/settings/payments" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Tabs items={SETTINGS_TABS} className="mb-4" />
      {children}
    </>
  );
}
