"use client";

import Link from "next/link";
import { ArrowRight, Clapperboard, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, PageHeader, StatusPill, Surface } from "@/components/console-kit";

export default function AssetsPage() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api("/v1/assets")
      .then((data) => setItems(data.items || []))
      .catch((error) => setMessage(error.message));
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.title, item.provider, item.status, item.id].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term),
      ),
    );
  }, [items, query]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Protected media"
        title="Assets"
        description="Videos discovered or registered by your Unpirator integration appear here automatically. Use this page to inspect and manage them, not to duplicate your LMS content workflow."
        action={
          <Link
            href="/dashboard/integration"
            className="inline-flex items-center gap-2 rounded-xl bg-[#172014] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Integration setup <ArrowRight size={15} />
          </Link>
        }
      />

      {message && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {message}
        </div>
      )}

      <Surface className="overflow-hidden">
        <div className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#edf5d8] text-[#536b31]">
              <ShieldCheck size={20} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-[#71805b]">
                Integration-managed inventory
              </p>
              <h2 className="mt-1 text-lg font-semibold">Your app remains the source of truth</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6f7a68]">
                Your plugin or server integration registers content with Unpirator as it is used.
                The dashboard does not require you to manually recreate videos that already exist in
                your LMS, CMS or application.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/integration"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#536b31]"
          >
            Review integration <ArrowRight size={14} />
          </Link>
        </div>
      </Surface>

      <div className="flex items-center gap-2 rounded-2xl border border-[#dfe4d6] bg-white px-4 py-2.5">
        <Search size={16} className="text-[#8a9483]" />
        <input
          className="w-full bg-transparent text-sm outline-none"
          placeholder="Search assets, provider, status or ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={items.length ? "No matching assets" : "No assets discovered yet"}
          description={
            items.length
              ? "Try a different search term."
              : "Complete your integration and start protected playback. Registered content will appear here automatically."
          }
          href={items.length ? undefined : "/dashboard/integration"}
          action={items.length ? undefined : "Open integration"}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <Link key={item.id} href={`/dashboard/assets/${item.id}`} className="block">
              <Surface className="group h-full p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-2xl bg-[#edf5d8] text-[#536b31] transition group-hover:bg-[#e6f0ca]">
                    <Clapperboard size={18} />
                  </span>
                  <StatusPill status={item.status} />
                </div>

                <h2 className="mt-6 line-clamp-2 font-semibold">{item.title}</h2>
                <p className="mt-2 text-xs uppercase tracking-[.12em] text-[#899283]">
                  {item.provider} · plan-protected
                </p>

                <div className="mt-5 border-t border-[#edf0e9] pt-4 text-xs text-[#7b8574]">
                  <p>Created at: {new Date(item.createdAt).toLocaleString()}</p>
                  {item.updatedAt && item.updatedAt !== item.createdAt && (
                    <p className="mt-1">Updated at: {new Date(item.updatedAt).toLocaleString()}</p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-mono text-[10px] text-[#9aa292]">{item.id}</p>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#536b31]">
                    Open <ArrowRight size={13} />
                  </span>
                </div>
              </Surface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
