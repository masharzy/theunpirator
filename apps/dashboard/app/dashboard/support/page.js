import Link from "next/link";
import { BookOpen, Bug, LifeBuoy, ShieldAlert } from "lucide-react";
import { PageHeader, Surface } from "@/components/console-kit";

const options = [
  [BookOpen, "Read the documentation", "Setup, playback and API guides.", "/docs"],
  [Bug, "Inspect operational logs", "Find the exact request or security event.", "/dashboard/logs"],
  [
    ShieldAlert,
    "Review Security Center",
    "Investigate blocks, devices and risky sessions.",
    "/dashboard/security",
  ],
];
export default function SupportPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Help center"
        title="Support"
        description="Resolve setup and playback issues using live workspace diagnostics and focused guides."
      />
      <Surface className="overflow-hidden">
        <div className="bg-[#172014] p-7 text-white">
          <LifeBuoy size={26} className="text-[#cbe58c]" />
          <h2 className="mt-5 text-2xl font-semibold">Start with the affected workflow</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
            Open the relevant diagnostic surface, copy the request or event ID, and include it when
            contacting platform support.
          </p>
        </div>
        <div className="grid gap-px bg-[#e1e6da] md:grid-cols-3">
          {options.map(([Icon, title, body, href]) => (
            <Link href={href} key={href} className="bg-white p-6 hover:bg-[#f8faf4]">
              <Icon size={19} className="text-[#607a39]" />
              <b className="mt-4 block text-sm">{title}</b>
              <p className="mt-2 text-xs leading-5 text-[#74806d]">{body}</p>
            </Link>
          ))}
        </div>
      </Surface>
    </div>
  );
}
