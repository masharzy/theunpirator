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

function label(value) {
  return String(value)
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

const hidden = (key) =>
  ["tenantId", "metadata", "encryptedSecret", "secretHash", "providerReference"].includes(key) ||
  key === "id" ||
  key.endsWith("Id") ||
  key.endsWith("_id");

function value(input) {
  if (input == null || input === "") return "—";
  if (typeof input === "boolean") return input ? "Enabled" : "Disabled";
  if (Array.isArray(input)) return input.map((item) => String(item)).join(", ") || "—";
  if (typeof input === "object") {
    const safe = Object.entries(input)
      .filter(
        ([key, nested]) => !hidden(key) && ["string", "number", "boolean"].includes(typeof nested),
      )
      .slice(0, 6);
    return safe.length
      ? safe.map(([key, nested]) => `${label(key)}: ${String(nested)}`).join(" · ")
      : "Structured details";
  }
  if (String(input).match(/^\d{4}-\d{2}-\d{2}T/)) return new Date(input).toLocaleString();
  return String(input);
}

export function DataPage({ title, description, endpoint, render }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api(endpoint)
      .then((response) => {
        if (active) setData(response);
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

  const items = data?.items;
  const columns = useMemo(() => {
    if (!items?.[0]) return [];
    return Object.keys(items[0])
      .filter((key) => !hidden(key))
      .slice(0, 7);
  }, [items]);

  return (
    <div className="space-y-8">
      <PageHeader title={title} description={description} />
      <ErrorPanel message={error} onRetry={() => setReloadKey((current) => current + 1)} />

      {loading && data === null ? (
        <LoadingPanel label={`Loading ${title.toLowerCase()}…`} />
      ) : data === null ? null : render ? (
        render(data)
      ) : Array.isArray(items) ? (
        items.length ? (
          <Surface className="overflow-hidden">
            <div className="divide-y divide-[#e7eadf] md:hidden">
              {items.map((row, index) => (
                <article className="p-5" key={row.id || index}>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {columns.map((column) => (
                      <div key={column}>
                        <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8b9584]">
                          {label(column)}
                        </dt>
                        <dd className="mt-1 break-words text-sm text-[#465240]">
                          {value(row[column])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">{title} details</caption>
                <thead className="bg-[#f3f6ed] text-[10px] uppercase tracking-[.12em] text-[#73806b]">
                  <tr>
                    {columns.map((column) => (
                      <th scope="col" className="px-5 py-4" key={column}>
                        {label(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, index) => (
                    <tr className="border-t border-[#e7eadf]" key={row.id || index}>
                      {columns.map((column) => (
                        <td
                          className="max-w-72 break-words px-5 py-4 text-xs text-[#465240]"
                          key={column}
                        >
                          {value(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>
        ) : (
          <EmptyState
            title={`No ${title.toLowerCase()} yet`}
            description="Activity will appear here automatically."
          />
        )
      ) : (
        <Surface className="p-5 sm:p-6">
          <dl className="grid gap-4 sm:grid-cols-2">
            {Object.entries(data)
              .filter(([key]) => !hidden(key))
              .map(([key, nested]) => (
                <div key={key} className="rounded-xl border border-[#e4e8dc] p-4">
                  <dt className="text-xs text-[#7b8574]">{label(key)}</dt>
                  <dd className="mt-2 break-words text-sm font-medium text-[#33402d]">
                    {value(nested)}
                  </dd>
                </div>
              ))}
          </dl>
        </Surface>
      )}
    </div>
  );
}
