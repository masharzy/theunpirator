"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LockKeyhole, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, StatusPill, Surface } from "@/components/console-kit";

export default function PoliciesPage() {
  const [settings, setSettings] = useState(null);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api("/v1/workspace/settings"), api("/v1/assets")])
      .then(([workspace, media]) => {
        setSettings(workspace);
        setAssets(media.items || []);
      })
      .catch((failure) => setError(failure.message));
  }, []);
  const policy = settings?.settings?.defaultSecurityPolicy || "strict";
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Security posture"
        title="Policies"
        description="Review the workspace default and every asset-level playback policy from one control surface."
        action={
          <Link
            className="rounded-xl bg-[#172014] px-4 py-2.5 text-sm font-semibold text-white"
            href="/dashboard/settings"
          >
            Edit default policy
          </Link>
        }
      />
      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Surface className="p-5">
          <ShieldCheck className="text-[#607a39]" />
          <p className="mt-5 text-xs text-[#74806d]">Workspace default</p>
          <p className="mt-2 text-2xl font-semibold capitalize">{policy}</p>
        </Surface>
        <Surface className="p-5">
          <LockKeyhole className="text-[#607a39]" />
          <p className="mt-5 text-xs text-[#74806d]">Protected assets</p>
          <p className="mt-2 text-2xl font-semibold">
            {assets.filter((asset) => asset.status === "active").length}
          </p>
        </Surface>
        <Surface className="p-5">
          <SlidersHorizontal className="text-[#607a39]" />
          <p className="mt-5 text-xs text-[#74806d]">Asset overrides</p>
          <p className="mt-2 text-2xl font-semibold">
            {
              assets.filter((asset) => asset.securityPolicy && asset.securityPolicy !== policy)
                .length
            }
          </p>
        </Surface>
      </div>
      <Surface className="overflow-hidden">
        <div className="border-b border-[#e4e8dd] p-5">
          <h2 className="font-semibold">Effective asset policies</h2>
        </div>
        {assets.length ? (
          assets.map((asset) => (
            <Link
              href={`/dashboard/assets/${asset.id}`}
              key={asset.id}
              className="flex items-center justify-between gap-4 border-b border-[#e8ebe3] px-5 py-4 last:border-0 hover:bg-[#f8faf4]"
            >
              <span>
                <b className="block text-sm">{asset.title}</b>
                <small className="text-[#7a8573]">{asset.provider}</small>
              </span>
              <StatusPill status={asset.securityPolicy || policy} />
            </Link>
          ))
        ) : (
          <p className="p-8 text-sm text-[#74806d]">
            Register an asset to apply a playback policy.
          </p>
        )}
      </Surface>
    </div>
  );
}
