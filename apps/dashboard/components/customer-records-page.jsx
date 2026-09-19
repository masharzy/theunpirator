"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  EmptyState,
  ErrorPanel,
  LoadingPanel,
  PageHeader,
  Surface,
} from "@/components/console-kit";

const hiddenKeys = new Set([
  "tenantId",
  "metadata",
  "encryptedSecret",
  "secretHash",
  "externalUserId",
  "providerReference",
]);

const humanize = (value) =>
  String(value)
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());

const customerFacingKey = (key) =>
  !hiddenKeys.has(key) && key !== "id" && !key.endsWith("Id") && !key.endsWith("_id");

const display = (value) => {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ") || "—";
  if (typeof value === "object") {
    const safe = Object.entries(value)
      .filter(([, nested]) => ["string", "number", "boolean"].includes(typeof nested))
      .slice(0, 4);
    return safe.length
      ? safe.map(([key, nested]) => `${humanize(key)}: ${String(nested)}`).join(" · ")
      : "Structured details";
  }
  if (String(value).match(/^\d{4}-\d{2}-\d{2}T/)) return new Date(value).toLocaleString();
  return String(value);
};

const priorities = [
  "viewerEmail",
  "email",
  "name",
  "title",
  "action",
  "status",
  "role",
  "resource",
  "target",
  "createdAt",
  "updatedAt",
  "lastSeenAt",
];

export function CustomerRecordsPage({ eyebrow, title, description, endpoint, empty }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api(endpoint)
      .then((response) => {
        if (active) setItems(response.items || []);
      })
      .catch((failure) => {
        if (active) setError(failure.message || `Unable to load ${title.toLowerCase()}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint, reloadKey, title]);

  const columns = useMemo(() => {
    if (!items?.[0]) return [];
    const keys = Object.keys(items[0]).filter(customerFacingKey);
    return [
      ...priorities.filter((key) => keys.includes(key)),
      ...keys.filter((key) => !priorities.includes(key)),
    ].slice(0, 7);
  }, [items]);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <ErrorPanel message={error} onRetry={() => setReloadKey((value) => value + 1)} />

      {loading && items === null ? (
        <LoadingPanel label={`Loading ${title.toLowerCase()}…`} />
      ) : items === null ? null : items.length === 0 ? (
        <EmptyState title={empty} description="New activity will appear here automatically." />
      ) : columns.length === 0 ? (
        <EmptyState
          title="No customer-facing details to show"
          description="Technical identifiers are intentionally kept out of this view."
        />
      ) : (
        <Surface className="overflow-hidden">
          <div className="divide-y divide-[#e7eadf] md:hidden">
            {items.map((item, index) => (
              <article className="p-5" key={item.id || index}>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {columns.map((column) => (
                    <div key={column} className="min-w-0">
                      <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8b9584]">
                        {humanize(column)}
                      </dt>
                      <dd className="mt-1 break-words text-sm text-[#465240]">
                        {display(item[column])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">{title} records</caption>
              <thead className="bg-[#f3f6ed] text-[10px] uppercase tracking-[.12em] text-[#73806b]">
                <tr>
                  {columns.map((column) => (
                    <th scope="col" className="px-5 py-4" key={column}>
                      {humanize(column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr className="border-t border-[#e7eadf]" key={item.id || index}>
                    {columns.map((column) => (
                      <td
                        className="max-w-72 break-words px-5 py-4 text-xs text-[#465240]"
                        key={column}
                      >
                        {display(item[column])}
                      </td>
                    ))}
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
