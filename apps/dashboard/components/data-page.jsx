"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
function label(value) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
}
function value(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Enabled" : "Disabled";
  if (typeof v === "object")
    return Object.entries(v)
      .map(([k, x]) => `${label(k)}: ${String(x)}`)
      .join(" · ");
  return String(v);
}
export function DataPage({ title, description, endpoint, render }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(endpoint)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);
  const items = data?.items;
  const columns = items?.length
    ? Object.keys(items[0])
        .filter((k) => !["tenantId", "metadata", "encryptedSecret", "secretHash"].includes(k))
        .slice(0, 7)
    : [];
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted-foreground">{description}</p>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{title} details</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : !data ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading…
            </p>
          ) : render ? (
            render(data)
          ) : Array.isArray(items) ? (
            items.length ? (
              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {columns.map((k) => (
                        <th className="border-b p-3 font-medium" key={k}>
                          {label(k)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row, i) => (
                      <tr key={row.id || i}>
                        {columns.map((k) => (
                          <td className="max-w-64 border-b p-3 text-xs break-words" key={k}>
                            {value(row[k])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed px-5 py-12 text-center">
                <h2 className="font-medium">No {title.toLowerCase()} yet</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Activity will appear here when you start using your workspace.
                </p>
              </div>
            )
          ) : (
            <div className="grid gap-6">
              {Object.entries(data).map(([key, v]) => (
                <section key={key}>
                  <h2 className="mb-3 font-medium">{label(key)}</h2>
                  {v && typeof v === "object" ? (
                    <dl className="grid gap-3 sm:grid-cols-2">
                      {Object.entries(v).map(([k, x]) => (
                        <div key={k} className="rounded-lg border p-4">
                          <dt className="text-xs text-muted-foreground">{label(k)}</dt>
                          <dd className="mt-2 break-words text-sm font-medium">{value(x)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p>{value(v)}</p>
                  )}
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
