import { Tabs } from "@/components/ui/tabs";

// The Workspace family's tab row, rendered inside the content surface directly
// under the page H1 on each of the five board pages. The sidebar carries a
// single top-level "Workspace" item; the sub-surfaces switch here (Stellate
// pattern: sidebar = destinations, in-content tabs = sub-views). Tabs marks the
// active item off the pathname.

const ITEMS = [
  { key: "workspace", label: "Workspace", href: "/workspace" },
  { key: "analytics", label: "Analytics", href: "/analytics" },
  { key: "dashboard", label: "Dashboard", href: "/dashboard" },
  { key: "data-dictionary", label: "Data dictionary", href: "/workspace/data-dictionary" },
  { key: "schema", label: "Schema", href: "/workspace/schema" },
  { key: "docs", label: "Docs", href: "/workspace/docs" },
];

export function BoardTabs() {
  return <Tabs items={ITEMS} />;
}
