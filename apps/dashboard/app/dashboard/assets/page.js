"use client";

import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, PageHeader, StatusPill, Surface } from "@/components/console-kit";

const PAGE_SIZE = 24;

export default function AssetsPage() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: "newest",
    });
    if (search) params.set("search", search);

    api(`/v1/assets?${params.toString()}`, { signal: controller.signal })
      .then((data) => {
        setItems(data.items || []);
        setPagination(
          data.pagination || {
            page,
            limit: PAGE_SIZE,
            total: 0,
            totalPages: 1,
            hasNext: false,
            hasPrevious: page > 1,
          },
        );
        if (data.pagination?.page && data.pagination.page !== page) {
          setPage(data.pagination.page);
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") setMessage(error.message || "Assets could not be loaded");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [page, search]);

  const hasSearch = Boolean(search);

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

      <Surface className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#dfe4d6] bg-[#fbfcf9] px-3.5 py-2.5 sm:max-w-xl">
            <Search size={16} className="shrink-0 text-[#8a9483]" />
            <label htmlFor="asset-search" className="sr-only">
              Search assets
            </label>
            <input
              id="asset-search"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9aa292]"
              placeholder="Search title, source, status or ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                className="cursor-pointer rounded-lg p-1 text-[#8a9483] transition hover:bg-[#eef1e9]"
                onClick={() => setQuery("")}
                aria-label="Clear asset search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <p className="text-xs text-[#7b8574]">
            {pagination.total.toLocaleString()} {pagination.total === 1 ? "asset" : "assets"}
          </p>
        </div>
      </Surface>

      {loading && items.length === 0 ? (
        <Surface className="p-10 text-sm text-[#74806d]">Loading asset inventory…</Surface>
      ) : items.length === 0 ? (
        <EmptyState
          title={hasSearch ? "No matching assets" : "No assets discovered yet"}
          description={
            hasSearch
              ? "Try a different search term."
              : "Complete your integration and start protected playback. Registered content will appear here automatically."
          }
          href={hasSearch ? undefined : "/dashboard/integration"}
          action={hasSearch ? undefined : "Open integration"}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
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
                      <p className="mt-1">
                        Updated at: {new Date(item.updatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-mono text-[10px] text-[#9aa292]">
                      {item.id}
                    </p>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#536b31]">
                      Open <ArrowRight size={13} />
                    </span>
                  </div>
                </Surface>
              </Link>
            ))}
          </div>

          <Surface className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#7b8574]">
              Page <span className="font-semibold text-[#46513f]">{pagination.page}</span> of{" "}
              {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!pagination.hasPrevious || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#dfe4d6] bg-white px-3 py-2 text-xs font-semibold text-[#46513f] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                type="button"
                disabled={!pagination.hasNext || loading}
                onClick={() => setPage((value) => value + 1)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#dfe4d6] bg-white px-3 py-2 text-xs font-semibold text-[#46513f] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </Surface>
        </>
      )}
    </div>
  );
}
