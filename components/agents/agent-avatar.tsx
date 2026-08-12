import { Icon } from "@/components/ui/icons";
import { AGENTS } from "@/lib/agents/registry";

// One identity mark for an agent, shared by every surface that shows one (inbox
// list, thread view, the dock header and its picker). An agent has no Avatar —
// no user row, no initials worth showing — so it renders its portrait when it
// has one and its registry icon on a teal wash when it doesn't.

const PX = { sm: "h-7 w-7", md: "h-10 w-10" } as const;
const ICON_PX = { sm: 15, md: 20 } as const;

export function AgentAvatar({ agentId, size = "sm" }: { agentId: string; size?: "sm" | "md" }) {
  const def = AGENTS.find((a) => a.id === agentId);
  if (def?.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- fixed-size avatar, not page content
      <img
        src={def.image}
        alt=""
        aria-hidden
        className={`${PX[size]} shrink-0 rounded-full object-cover`}
        loading="lazy"
      />
    );
  }
  return (
    <span className={`flex ${PX[size]} shrink-0 items-center justify-center rounded-full bg-primary-wash text-primary`}>
      <Icon name={def?.icon ?? "sparkle"} size={ICON_PX[size]} />
    </span>
  );
}
