"use client";

import {
  Activity,
  Building2,
  ChevronLeft,
  ChevronRight,
  Code2,
  CreditCard,
  FileVideo2,
  Search,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, PageHeader, Surface } from "@/components/console-kit";

const categories = {
  workspace: { label: "Workspace", icon: Building2 },
  access: { label: "Access", icon: ShieldCheck },
  content: { label: "Content", icon: FileVideo2 },
  developer: { label: "Developer", icon: Code2 },
  billing: { label: "Billing", icon: CreditCard },
};

function time(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

function Metric({ label, value, hint, icon: Icon }) {
  return (
    <Surface className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#879080]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-[#263120]">
            {Number(value || 0).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-[#899283]">{hint}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-xl bg-[#edf5d8] text-[#536b31]">
          <Icon size={16} />
        </span>
      </div>
    </Surface>
  );
}

function TechnicalValue({ children }) {
  return <span className="break-all font-mono text-[11px] text-[#5c6656]">{children || "—"}</span>;
}

export default function AuditPage() {
  const [items, setItems] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [summary, setSummary] = useState({ total: 0, last24Hours: 0, actorCount: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
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
    });
    if (search) params.set("q", search);
    return `/v1/audit?${params}`;
  }, [category, page, search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSelected(null);

    api(endpoint, { signal: controller.signal })
      .then((response) => {
        setItems(response.items || []);
        setPagination(response.pagination || { page, pageSize: 25, total: 0, totalPages: 1 });
        setSummary(response.summary || { total: 0, last24Hours: 0, actorCount: 0 });
      })
      .catch((failure) => {
        if (failure.name !== "AbortError") {
          setError(failure.message || "Audit activity could not be loaded");
        }
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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace governance"
        title="Audit log"
        description="A readable history of administrative changes across your workspace. Search by person, action, resource, IP or technical identifier when you need deeper investigation."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Audit entries"
          value={summary.total}
          hint="Workspace history"
          icon={Activity}
        />
        <Metric
          label="Last 24 hours"
          value={summary.last24Hours}
          hint="Recent administrative changes"
          icon={ShieldCheck}
        />
        <Metric
          label="Actors"
          value={summary.actorCount}
          hint="Accounts represented in the log"
          icon={UsersRound}
        />
      </div>

      <Surface className="p-4 md:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a9483]"
            />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search actor, action, resource, IP or ID…"
              className="h-11 w-full rounded-xl border border-[#dfe4d8] bg-white pl-10 pr-4 text-sm outline-none transition focus:border-[#9aaa84] focus:ring-2 focus:ring-[#dfe8cf]"
            />
          </label>

          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
            className="h-11 rounded-xl border border-[#dfe4d8] bg-white px-3 text-sm font-medium text-[#394334] outline-none"
          >
            <option value="all">All activity</option>
            <option value="workspace">Workspace</option>
            <option value="access">Viewer & access</option>
            <option value="content">Content & sites</option>
            <option value="developer">Developer</option>
            <option value="billing">Billing</option>
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
        <Surface className="p-10 text-sm text-[#74806d]">Loading audit activity…</Surface>
      ) : items.length === 0 ? (
        <EmptyState
          title="No matching audit activity"
          description="Administrative changes will appear here automatically as your team manages the workspace."
        />
      ) : (
        <Surface className="overflow-hidden">
          <div className="border-b border-[#e6eadf] px-5 py-3 text-xs text-[#7c8675]">
            {pagination.total.toLocaleString()} matching{" "}
            {pagination.total === 1 ? "entry" : "entries"}
          </div>

          <div className="divide-y divide-[#e8ebe3]">
            {items.map((item) => {
              const info = categories[item.category] || categories.workspace;
              const Icon = info.icon;
              return (
                <button
                  type="button"
                  key={item.technical.auditId}
                  onClick={() => setSelected(item)}
                  className="grid w-full cursor-pointer gap-4 px-5 py-5 text-left transition hover:bg-[#fafbf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b8c89d] md:grid-cols-[minmax(0,1fr)_200px_180px] md:items-center"
                >
                  <div className="flex min-w-0 gap-3.5">
                    <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1f5ec] text-[#627150]">
                      <Icon size={17} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[#253021]">{item.title}</p>
                        <span className="rounded-full bg-[#f1f5ec] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#657354] ring-1 ring-[#dde6d3]">
                          {info.label}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-[#697363]">
                        {item.summary}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Actor
                    </p>
                    <p className="mt-1 truncate text-sm text-[#4b5745]">{item.actor}</p>
                    <p className="mt-1 truncate text-xs text-[#8a9483]">{item.target}</p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Occurred
                    </p>
                    <p className="mt-1 text-sm text-[#4b5745]">{time(item.createdAt)}</p>
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
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => setPage((value) => value + 1)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
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
            aria-label="Audit entry details"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e3e7de] bg-[#fbfcf8]/95 px-5 py-4 backdrop-blur">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#7b8673]">
                  Audit details
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[#253021]">{selected.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="grid size-9 cursor-pointer place-items-center rounded-xl border bg-white"
                aria-label="Close audit details"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-6 p-5 md:p-6">
              <Surface className="p-5">
                <p className="text-sm leading-6 text-[#5f6b58]">{selected.summary}</p>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Actor
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-[#3a4634]">{selected.actor}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Category
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-[#3a4634]">
                      {categories[selected.category]?.label || "Workspace"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Resource
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-[#3a4634]">{selected.target}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Occurred
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-[#3a4634]">
                      {time(selected.createdAt)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Source IP
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-[#3a4634]">
                      {selected.sourceIp || "Not recorded"}
                    </dd>
                  </div>
                </dl>
              </Surface>

              <details className="group rounded-2xl border border-[#e2e7dc] bg-white">
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[#34402f]">
                  Technical details
                </summary>
                <div className="space-y-4 border-t border-[#e8ebe4] px-5 py-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Action key
                    </p>
                    <p className="mt-1">
                      <TechnicalValue>{selected.technical.action}</TechnicalValue>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Audit ID
                    </p>
                    <p className="mt-1">
                      <TechnicalValue>{selected.technical.auditId}</TechnicalValue>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Target type
                    </p>
                    <p className="mt-1">
                      <TechnicalValue>{selected.technical.targetType}</TechnicalValue>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Target ID
                    </p>
                    <p className="mt-1">
                      <TechnicalValue>{selected.technical.targetId}</TechnicalValue>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                      Metadata
                    </p>
                    <pre className="mt-2 overflow-x-auto rounded-xl bg-[#f5f7f2] p-3 text-[11px] leading-5 text-[#4f5b49]">
                      {JSON.stringify(selected.technical.metadata || {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
