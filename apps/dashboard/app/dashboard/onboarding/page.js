"use client";

import Link from "next/link";
import { ArrowRight, Check, KeyRound, PlugZap, ShieldCheck, Waypoints, Clapperboard } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { PageHeader, Surface } from "@/components/console-kit";

export default function OnboardingPage() {
  const auth = useAuth();
  const [summary, setSummary] = useState(null);
  const [connections, setConnections] = useState([]);
  const [keys, setKeys] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([
      api("/v1/workspace/summary"),
      api("/v1/workspace/connections").catch(() => ({ items: [] })),
      api("/v1/api-keys").catch(() => ({ items: [] })),
    ])
      .then(([summaryData, connectionData, keyData]) => {
        setSummary(summaryData);
        setConnections(connectionData.items || []);
        setKeys(keyData.items || []);
      })
      .catch((e) => setMessage(e.message));
  }, []);

  const counts = summary?.counts || {};
  const steps = [
    [ShieldCheck, "Verify your email", "Unlock production credentials and billing.", "/dashboard/account", Boolean(auth?.account?.emailVerified)],
    [Waypoints, "Add & verify a site", "Register the domain where your protected player runs.", "/dashboard/sites", counts.verifiedSites > 0],
    [PlugZap, "Save a provider connection", "Encrypt reusable R2, S3, Bunny or origin credentials.", "/dashboard/connections", connections.length > 0],
    [Clapperboard, "Register an asset", "Connect an authorized source to the protected gateway.", "/dashboard/assets", counts.assets > 0],
    [KeyRound, "Create an API key", "Authorize your backend to issue playback sessions.", "/dashboard/api-keys", keys.some((key) => !key.revokedAt)],
  ];

  const complete = steps.filter((step) => step[4]).length;
  const percent = Math.round((complete / steps.length) * 100);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Launch path"
        title="Protect your first video"
        description="A guided path from workspace creation to your first protected playback session."
      />
      {message && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>}

      <Surface className="overflow-hidden">
        <div className="bg-[#172014] p-6 text-white">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[.16em] text-white/50">Setup progress</p>
              <p className="mt-2 text-3xl font-semibold">{percent}%</p>
            </div>
            <p className="text-sm text-white/60">{complete} of {steps.length} complete</p>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#d7ff75]" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <div className="divide-y divide-[#edf0e9]">
          {steps.map(([Icon, title, description, href, done], index) => (
            <Link key={title} href={href} className="group flex items-center gap-4 p-5 transition hover:bg-[#fafbf8]">
              <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${done ? "bg-emerald-50 text-emerald-600" : "bg-[#edf5d8] text-[#536b31]"}`}>
                {done ? <Check size={18} /> : <Icon size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[.16em] text-[#9aa292]">0{index + 1}</span>
                  <h2 className="font-semibold">{title}</h2>
                </div>
                <p className="mt-1 text-sm text-[#75806e]">{description}</p>
              </div>
              <ArrowRight size={17} className="text-[#9ca594] transition group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </Surface>
    </div>
  );
}
