import { TextLink } from "@/components/ui/text-link";

// A user turn's text, with "@Name (NPI 1234567890)" / "(TIN 123456789)" turned
// into links to the record. The composer writes that shape when you pick from
// the "@" menu; without this it reads as plain prose and the clinician can't
// tell a resolved record from something they typed by hand.

const MENTION = /@([^()\n]+?)\s*\((NPI|TIN)\s*([0-9]{9,10})\)/g;

export function MentionText({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  MENTION.lastIndex = 0;
  while ((m = MENTION.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [, label, kind, id] = m;
    out.push(
      <TextLink
        key={k++}
        href={kind === "NPI" ? `/directory/providers/${id}` : `/orgs/${id}`}
        className="!text-[length:inherit]"
      >
        {label.trim()}
      </TextLink>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
