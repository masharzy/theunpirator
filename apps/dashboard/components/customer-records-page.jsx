"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, PageHeader, Surface } from "@/components/console-kit";

const humanize = (value) =>
  value.replace(/([A-Z])/g, " $1").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const display = (value) => {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (String(value).match(/^\d{4}-\d{2}-\d{2}T/)) return new Date(value).toLocaleString();
  return String(value);
};

export function CustomerRecordsPage({ eyebrow, title, description, endpoint, empty }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(endpoint)
      .then((response) => setItems(response.items || []))
      .catch((failure) => setError(failure.message));
  }, [endpoint]);
  const columns = useMemo(
    () =>
      items?.[0]
        ? Object.keys(items[0])
            .filter((key) => !["metadata", "tenantId"].includes(key))
            .slice(0, 7)
        : [],
    [items],
  );
  return (
    <div className="space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {items === null ? (
        <Surface className="p-10 text-sm text-[#74806d]">Loading live workspace data…</Surface>
      ) : items.length === 0 ? (
        <EmptyState title={empty} description="New activity will appear here automatically." />
      ) : (
        <Surface className="overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-[#f3f6ed] text-[10px] uppercase tracking-[.12em] text-[#73806b]">
                <tr>{columns.map((column) => <th className="px-5 py-4" key={column}>{humanize(column)}</th>)}</tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr className="border-t border-[#e7eadf]" key={item.id || index}>
                    {columns.map((column) => <td className="max-w-72 break-words px-5 py-4 text-xs text-[#465240]" key={column}>{display(item[column])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      )}
    </div>
  );
}
