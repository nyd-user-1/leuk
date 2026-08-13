"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, MenuDivider, MenuItem } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icons";
import { UserChip } from "@/components/ui/user-chip";
import type { SessionUser } from "@/lib/auth";

// The account control — UserChip trigger + the account menu. Lives at the
// bottom of the Sidebar (opens upward). Owns sign-out, the light/dark
// appearance toggle (shared with the marketing site via `mkt-theme`), and the
// ⌘, → Settings shortcut. `collapsed` folds the chip to just the avatar in the
// icon rail.
export function AccountMenu({ user, collapsed = false }: { user: SessionUser; collapsed?: boolean }) {
  const router = useRouter();

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/sign-in");
    router.refresh();
  };

  // Appearance — one preference shared with the marketing site (`mkt-theme`);
  // the `dark` class on <html> drives the `:root.dark` token block in
  // globals.css. Applied on mount so a stored preference survives full loads.
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const isDark = localStorage.getItem("mkt-theme") === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("mkt-theme", next ? "dark" : "light");
  };

  // ⌘, / Ctrl+, → Settings (honors the shortcut hint shown in the account menu).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        router.push("/settings");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <DropdownMenu
      label="Account menu"
      placement="top"
      align="left"
      width="w-64"
      triggerClassName={collapsed ? "flex w-full justify-center" : "w-full"}
      trigger={
        <UserChip name={user.name} hue={user.avatarHue} src={user.photoUrl} collapsed={collapsed} className="max-w-full" />
      }
    >
      {/* Identity header */}
      <div className="flex items-center gap-3 px-2.5 py-2">
        <Avatar name={user.name} hue={user.avatarHue} src={user.photoUrl} size="md" />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-text">{user.name}</span>
          <span className="block truncate text-sm text-text-muted">{user.email}</span>
        </span>
      </div>

      <MenuDivider />

      <MenuItem
        icon="gear"
        label="Settings"
        onClick={() => router.push("/settings")}
        trailing={
          <kbd className="rounded-[5px] border border-border bg-canvas px-1.5 py-0.5 text-[12px] font-medium text-text-muted">
            ⌘,
          </kbd>
        }
      />
      <MenuItem
        icon="paint-roller"
        label="Design system"
        onClick={() => router.push("/design-system")}
        trailing={<Badge variant="info">New</Badge>}
      />
      {user.email === "brendan@leuk.demo" && (
        <MenuItem icon="grid" label="Data" onClick={() => router.push("/admin/data")} />
      )}
      <MenuItem
        icon={dark ? "sun" : "moon"}
        label="Appearance"
        onClick={toggleTheme}
        trailing={<span className="text-[13px] font-medium text-text-muted">{dark ? "Dark" : "Light"}</span>}
      />

      <MenuDivider />

      <MenuItem
        icon="message"
        label="Help"
        onClick={() => {
          window.location.href = "mailto:support@leuk.health";
        }}
        trailing={<Icon name="chevron-right" size={16} className="text-text-muted" />}
      />

      <MenuDivider />

      <MenuItem icon="log-out" label="Sign out" onClick={signOut} danger />
    </DropdownMenu>
  );
}
