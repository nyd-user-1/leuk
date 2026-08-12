// The push-panel mount point's DOM id. `AppPanel` (components/ui/app-panel.tsx)
// portals into this node, which AppShell renders as a FLEX SIBLING of the
// content column — so an open panel takes width from the page rather than
// covering it, and the panel outlives every route change because the node lives
// in the shell layout, outside `children`.
//
// Plain module (no "use client") so BOTH the server-side shell and code-split
// client chunks can import the id without pulling each other's module graphs
// along — same reason as main-panel.ts.
export const APP_PANEL_ROOT_ID = "app-panel-root";
