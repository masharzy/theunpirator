"use client";
import Link from "next/link";
import { ArrowRight, Building2, ShieldAlert, Users, Waypoints } from "lucide-react";
const cards = [
  [Users, "Accounts", "Manage privileged access and MFA", "/admin/accounts"],
  [Building2, "Workspaces", "Inspect every tenant and status", "/admin/workspaces"],
  [Waypoints, "Providers", "Track platform provider health", "/admin/providers"],
  [ShieldAlert, "Security", "Review incidents and enforcement", "/admin/security"],
];
export default function AdminCommandCenter() {
  return (
    <div>
      <p className="text-xs font-bold tracking-[.2em] text-[#657154]">COMMAND CENTER</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Platform operations</h1>
      <p className="mt-3 max-w-2xl text-[#64705d]">
        Control accounts, workspaces, revenue, infrastructure and trust operations from one
        protected surface.
      </p>
      <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(([Icon, title, description, href]) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-[#d9dfce] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-[#eaf6cc] text-[#405525]">
              <Icon size={19} />
            </span>
            <h2 className="mt-8 font-semibold">{title}</h2>
            <p className="mt-2 min-h-10 text-sm text-[#6b7564]">{description}</p>
            <ArrowRight className="mt-5 transition group-hover:translate-x-1" size={16} />
          </Link>
        ))}
      </div>
    </div>
  );
}
