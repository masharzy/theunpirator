"use client";

import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, PageHeader, Surface } from "@/components/console-kit";

const categoryUi = {
  usage: { label: "Operations", icon: Activity },
  security: { label: "Security", icon: ShieldAlert },
};

const levelUi = {
  info: "bg-[#f1f5ec] text-[#617052] ring-[#dce5d2]",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  critical: "bg-red-50 text-red-700 ring-red-200",
};

function time(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

function TechnicalValue({ children }) {
  return <span className="break-all font-mono text-[11px] text-[#5c6656]">{children || "—"}</span>;
}

export default function LogsPage() {
  const [items, setItems] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [level, setLevel] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "25",
      category,
      level,
    });
    if (search) params.set("q", search);
    return `/v1/operations-logs?${params}`;
  }, [page, category, level, search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSelected(null);
    api(endpoint, { signal: controller.signal })
      .then((response) => {
        setItems(response.items || []);
        setPagination(response.pagination || { page, pageSize: 25, total: 0, totalPages: 1 });
      })
      .catch((failure) => {
        if (failure.name !== "AbortError") setError(failure.message || "Logs could not be loaded");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint, page]);

  useEffect(() => {
    if (!selected) return undefined;
    const close = (event) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);

  const updateCategory = (value) => {
    setCategory(value);
    setPage(1);
  };
  const updateLevel = (value) => {
    setLevel(value);
    setPage(1);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Developer operations"
        title="Logs"
        description="Human-readable playback, gateway and security events. Search and filter the operational stream without exposing internal IDs in the main view."
      />

      <Surface className="p-4 md:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="relative block">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a9483]"
            />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search event or asset…"
              className="h-11 w-full rounded-xl border border-[#dfe4d8] bg-white pl-10 pr-4 text-sm outline-none transition focus:border-[#9aaa84] focus:ring-2 focus:ring-[#dfe8cf]"
            />
          </label>

          <label className="relative">
            <Filter
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7d8876]"
            />
            <select
              value={category}
              onChange={(event) => updateCategory(event.target.value)}
              className="h-11 min-w-44 appearance-none rounded-xl border border-[#dfe4d8] bg-white pl-9 pr-8 text-sm font-medium text-[#394334] outline-none"
            >
              <option value="all">All event types</option>
              <option value="usage">Operations</option>
              <option value="security">Security</option>
            </select>
          </label>

          <select
            value={level}
            onChange={(event) => updateLevel(event.target.value)}
            className="h-11 min-w-40 rounded-xl border border-[#dfe4d8] bg-white px-3 text-sm font-medium text-[#394334] outline-none"
          >
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </Surface>

      {error && (
        <p
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      {items === null || (loading && items.length === 0) ? (
        <Surface className="p-10 text-sm text-[#74806d]">Loading operational events…</Surface>
      ) : items.length === 0 ? (
        <EmptyState
          title="No matching operational events"
          description="New playback, gateway and security activity will appear here automatically."
        />
      ) : (
        <Surface className="overflow-hidden">
          <div className="border-b border-[#e6eadf] px-5 py-3 text-xs text-[#7c8675]">
            {pagination.total.toLocaleString()} matching{" "}
            {pagination.total === 1 ? "event" : "events"}
          </div>
          <div className="divide-y divide-[#e8ebe3]">
            {items.map((item) => {
              const categoryInfo = categoryUi[item.category] || categoryUi.usage;
              const Icon = categoryInfo.icon;
              return (
                <button
                  type="button"
                  key={item.technical.eventId}
                  onClick={() => setSelected(item)}
                  className="grid w-full gap-4 px-5 py-5 text-left transition hover:bg-[#fafbf8] md:grid-cols-[minmax(0,1fr)_180px_180px] md:items-center"
                >
                  <div className="flex min-w-0 gap-3.5">
                    <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1f5ec] text-[#627150]">
                      <Icon size={17} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[#253021]">{item.title}</p>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] ring-1 ${levelUi[item.level] || levelUi.info}`}
                        >
                          {item.level}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-[#697363]">
                        {item.summary}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Resource
                    </p>
                    <p className="mt-1 truncate text-sm text-[#4b5745]">{item.resource}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Occurred
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-[#4b5745]">
                      <Clock3 size={13} /> {time(item.createdAt)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 border-t border-[#e6eadf] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#7b8673]">
              Page {pagination.page} of {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1 || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => setPage((value) => value + 1)}
                className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </Surface>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[#172014]/20 backdrop-blur-[2px]"
          onMouseDown={() => setSelected(null)}
        >
          <aside
            className="h-full w-full max-w-xl overflow-y-auto bg-[#fbfcf8] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Log event details"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e3e7de] bg-[#fbfcf8]/95 px-5 py-4 backdrop-blur">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#7b8673]">
                  Event details
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[#253021]">{selected.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="grid size-9 place-items-center rounded-xl border bg-white"
                aria-label="Close details"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-6 p-5 md:p-6">
              <div className="rounded-2xl border border-[#e2e7dc] bg-white p-5">
                <p className="text-sm leading-6 text-[#5f6b58]">{selected.summary}</p>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Type
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-[#3a4634]">
                      {categoryUi[selected.category]?.label || selected.category}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Level
                    </dt>
                    <dd className="mt-1 text-sm font-medium capitalize text-[#3a4634]">
                      {selected.level}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Resource
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-[#3a4634]">{selected.resource}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Occurred
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-[#3a4634]">
                      {time(selected.createdAt)}
                    </dd>
                  </div>
                </dl>
              </div>

              <details className="group rounded-2xl border border-[#e2e7dc] bg-white">
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[#34402f]">
                  Technical details
                </summary>
                <div className="border-t border-[#e8ebe4] px-5 py-4">
                  <dl className="grid gap-4">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                        Event key
                      </dt>
                      <dd className="mt-1">
                        <TechnicalValue>{selected.technical.eventKey}</TechnicalValue>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                        Event ID
                      </dt>
                      <dd className="mt-1">
                        <TechnicalValue>{selected.technical.eventId}</TechnicalValue>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                        Asset ID
                      </dt>
                      <dd className="mt-1">
                        <TechnicalValue>{selected.technical.assetId}</TechnicalValue>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                        Session ID
                      </dt>
                      <dd className="mt-1">
                        <TechnicalValue>{selected.technical.sessionId}</TechnicalValue>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                        Quantity / risk
                      </dt>
                      <dd className="mt-1">
                        <TechnicalValue>
                          quantity={selected.technical.quantity} · riskScore=
                          {selected.technical.riskScore}
                        </TechnicalValue>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                        Metadata
                      </dt>
                      <dd className="mt-2 overflow-auto rounded-xl bg-[#f5f7f1] p-3">
                        <pre className="text-[11px] leading-5 text-[#53604d]">
                          {JSON.stringify(selected.technical.metadata || {}, null, 2)}
                        </pre>
                      </dd>
                    </div>
                  </dl>
                </div>
              </details>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
