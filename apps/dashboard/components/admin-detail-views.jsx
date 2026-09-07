import { ShieldCheck, UserRound, Building2 } from "lucide-react";
const show = (v) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
function Records({ items, empty = "No records in this section." }) {
  if (!items?.length)
    return (
      <p className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-[#778170]">
        {empty}
      </p>
    );
  const columns = Object.keys(items[0])
    .filter((k) => !["metadata", "encryptedConfig", "secretHash"].includes(k))
    .slice(0, 7);
  return (
    <div className="overflow-auto rounded-2xl border bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-[#f4f6ef]">
          <tr>
            {columns.map((k) => (
              <th className="p-3 capitalize" key={k}>
                {k.replaceAll("_", " ").replace(/([A-Z])/g, " $1")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr className="border-t" key={row.id || i}>
              {columns.map((k) => (
                <td className="max-w-64 break-words p-3" key={k}>
                  {show(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function AccountDetailView({ data }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5">
          <UserRound />
          <p className="mt-5 text-lg font-semibold">{data.account.email}</p>
          <p className="text-xs text-[#778170]">{data.account.id}</p>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <ShieldCheck />
          <p className="mt-5 font-semibold">{data.account.platformRole || "Customer"}</p>
          <p className="text-xs">
            MFA {data.account.mfaConfirmedAt ? "enabled" : "missing"} · {data.account.status}
          </p>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <Building2 />
          <p className="mt-5 text-2xl font-semibold">{data.memberships.length}</p>
          <p className="text-xs">Workspace memberships</p>
        </div>
      </div>
      <h2 className="font-semibold">Current sessions & login history</h2>
      <Records items={data.sessions} />
      <h2 className="font-semibold">Linked identities</h2>
      <Records items={data.identities} />
      <h2 className="font-semibold">Account audit trail</h2>
      <Records items={data.audit} />
    </div>
  );
}
export function WorkspaceSectionView({ data, section }) {
  if (section === "overview")
    return (
      <div className="space-y-5">
        <div className="rounded-3xl bg-[#172014] p-7 text-white">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#cbe58c]">
            Workspace profile
          </p>
          <h2 className="mt-3 text-3xl font-semibold">{data.tenant.name}</h2>
          <div className="mt-6 flex flex-wrap gap-3 text-xs">
            <span className="rounded-full bg-white/10 px-3 py-1">{data.tenant.status}</span>
            <span className="rounded-full bg-white/10 px-3 py-1">
              {data.subscription?.[0]?.planId || "No plan"}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1">{data.tenant.id}</span>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Records items={data.subscription} empty="No subscription." />
          <Records items={data.settings} empty="Default workspace settings apply." />
        </div>
      </div>
    );
  return <Records items={data.items} empty={`No ${section} records for this workspace.`} />;
}
