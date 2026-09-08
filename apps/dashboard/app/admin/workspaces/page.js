"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default function WorkspacesPage() {
  const [items, setItems] = useState([]),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [plan, setPlan] = useState(""),
    [subscriptionStatus, setSubscriptionStatus] = useState(""),
    [sort, setSort] = useState("created"),
    [nextCursor, setNextCursor] = useState(null),
    [error, setError] = useState("");
  const load = (append = false) =>
    api(
      `/v1/admin/tenants?${new URLSearchParams({ search, status, plan, subscriptionStatus, sort, cursor: append && nextCursor ? nextCursor : "" })}`,
    )
      .then((d) => {
        setItems((old) => (append ? [...old, ...(d.items || [])] : d.items || []));
        setNextCursor(d.nextCursor);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <div>
      <p className="text-xs font-bold tracking-[.2em] text-[#657154]">TENANT OPERATIONS</p>
      <h1 className="mt-3 text-4xl font-semibold">Workspaces</h1>
      <p className="mt-2 text-[#687260]">
        Plans, usage, media footprint, live sessions and security risk.
      </p>
      <div className="mt-7 flex flex-wrap gap-3 rounded-2xl border bg-[#f8f7f0] p-4">
        <Input
          className="max-w-md"
          placeholder="Search workspace or tenant ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <select
          className="rounded-xl border bg-white px-3"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option>active</option>
          <option>suspended</option>
          <option>disabled</option>
        </select>
        <select
          className="rounded-xl border bg-white px-3"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
        >
          <option value="">All plans</option>
          <option>starter</option>
          <option>pro</option>
          <option>business</option>
        </select>
        <select
          className="rounded-xl border bg-white px-3"
          value={subscriptionStatus}
          onChange={(e) => setSubscriptionStatus(e.target.value)}
        >
          <option value="">Any subscription</option>
          <option>trialing</option>
          <option>active</option>
          <option>expired</option>
          <option>canceled</option>
        </select>
        <select
          className="rounded-xl border bg-white px-3"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="created">Newest</option>
          <option value="name">Name</option>
          <option value="usage">Highest usage</option>
          <option value="bandwidth">Highest bandwidth</option>
          <option value="activity">Recent activity</option>
        </select>
        <Button onClick={load}>Apply</Button>
      </div>
      {nextCursor && (
        <Button className="mt-4" variant="outline" onClick={() => load(true)}>
          Load more
        </Button>
      )}
      {error && <p className="mt-4 bg-red-50 p-4 text-red-700">{error}</p>}
      <div className="mt-6 overflow-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[1500px] text-left text-sm">
          <thead className="border-b bg-[#f4f6ef]">
            <tr>
              {[
                "Workspace",
                "Owner",
                "Plan",
                "Subscription",
                "Usage %",
                "Sites",
                "Assets",
                "Viewers",
                "Live",
                "Monthly bandwidth",
                "Alerts",
                "Last activity",
                "Created",
              ].map((x) => (
                <th className="p-4" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((x) => (
              <tr className="border-b" key={x.id}>
                <td className="p-4">
                  <Link
                    className="font-semibold hover:underline"
                    href={`/admin/workspaces/${x.id}`}
                  >
                    {x.name}
                  </Link>
                  <p className="text-[10px] text-[#87917f]">{x.id}</p>
                </td>
                <td className="p-4">{x.owner_email || "—"}</td>
                <td className="p-4">{x.plan_id || "—"}</td>
                <td className="p-4">{x.subscription_status || x.status}</td>
                <td className="p-4">{x.usage_percent == null ? "—" : `${x.usage_percent}%`}</td>
                <td className="p-4">{x.sites}</td>
                <td className="p-4">{x.assets}</td>
                <td className="p-4">{x.viewers}</td>
                <td className="p-4">{x.active_sessions}</td>
                <td className="p-4">{Number(x.monthly_bandwidth || 0).toLocaleString()} B</td>
                <td className="p-4 font-semibold text-[#9f3024]">{x.security_alerts}</td>
                <td className="p-4">
                  {x.last_activity ? new Date(x.last_activity).toLocaleString() : "—"}
                </td>
                <td className="p-4">{new Date(x.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
