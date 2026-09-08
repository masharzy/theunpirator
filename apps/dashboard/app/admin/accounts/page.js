"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";
const roles = [
  "customer",
  "super_admin",
  "operations_admin",
  "billing_admin",
  "support_admin",
  "security_admin",
  "auditor",
];
export default function AdminAccounts() {
  const auth = useAuth();
  const canManage = auth?.account?.platformRole === "super_admin";
  const [accounts, setAccounts] = useState([]),
    [email, setEmail] = useState(""),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [roleFilter, setRoleFilter] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [mfaFilter, setMfaFilter] = useState(""),
    [verifiedFilter, setVerifiedFilter] = useState(""),
    [googleFilter, setGoogleFilter] = useState(""),
    [createdFrom, setCreatedFrom] = useState(""),
    [createdTo, setCreatedTo] = useState("");
  const load = () =>
    api(
      `/v1/admin/accounts?${new URLSearchParams({ search, role: roleFilter, status: statusFilter, mfa: mfaFilter, verified: verifiedFilter, google: googleFilter, createdFrom, createdTo })}`,
    ).then((data) => setAccounts(data.items));
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  async function create(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/v1/admin/accounts", { method: "POST", body: JSON.stringify({ email, reason }) });
      setEmail("");
      setMessage("Account invitation created.");
      await load();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function update(account, change) {
    if (reason.length < 8) {
      setMessage("Enter a reason of at least 8 characters first.");
      return;
    }
    setBusy(true);
    try {
      await api(`/v1/admin/accounts/${account.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...change, reason }),
      });
      setMessage("Access updated and the account was notified.");
      await load();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function resetMfa(account) {
    await updateMfa(account);
  }
  async function accountAction(account, action) {
    if (reason.length < 8) return setMessage("Enter a reason of at least 8 characters first.");
    setBusy(true);
    try {
      await api(`/v1/admin/accounts/${account.id}/actions`, {
        method: "POST",
        body: JSON.stringify({ action, reason }),
      });
      setMessage("Protected account action completed.");
      await load();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function updateMfa(account) {
    if (reason.length < 8) {
      setMessage("Enter a reason of at least 8 characters first.");
      return;
    }
    setBusy(true);
    try {
      await api(`/v1/admin/accounts/${account.id}/mfa-reset`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setMessage("MFA reset and all account sessions revoked.");
      await load();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p className="text-xs font-bold tracking-[.2em] text-[#657154]">IDENTITY & ACCESS</p>
      <h1 className="mt-3 text-4xl font-semibold">Platform accounts</h1>
      <p className="mt-2 text-sm text-[#687260]">
        API-enforced roles, MFA state and administrator handover.
      </p>
      {canManage && (
        <form
          onSubmit={create}
          className="mt-8 grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-[1fr_1fr_auto]"
        >
          <Input
            type="email"
            placeholder="new-admin@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            placeholder="Reason for invitation or access change"
            minLength={8}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          <Button disabled={busy}>Create account</Button>
        </form>
      )}
      {message && (
        <p role="status" className="mt-4 rounded-lg border bg-white p-3 text-sm">
          {message}
        </p>
      )}
      <div className="mt-6 grid gap-3 rounded-2xl border bg-[#f8f7f0] p-4 md:grid-cols-3 xl:grid-cols-6">
        <Input
          placeholder="Search email, ID, workspace or role"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <select
          className="rounded-md border bg-white px-3"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All roles</option>
          {roles.slice(1).map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <input
          aria-label="Created from"
          type="date"
          className="rounded-md border bg-white px-3"
          value={createdFrom}
          onChange={(e) => setCreatedFrom(e.target.value)}
        />
        <input
          aria-label="Created to"
          type="date"
          className="rounded-md border bg-white px-3"
          value={createdTo}
          onChange={(e) => setCreatedTo(e.target.value)}
        />
        <select
          className="rounded-md border bg-white px-3"
          value={mfaFilter}
          onChange={(e) => setMfaFilter(e.target.value)}
        >
          <option value="">Any MFA</option>
          <option value="enabled">MFA enabled</option>
          <option value="disabled">MFA missing</option>
        </select>
        <select
          className="rounded-md border bg-white px-3"
          value={verifiedFilter}
          onChange={(e) => setVerifiedFilter(e.target.value)}
        >
          <option value="">Any verification</option>
          <option value="yes">Email verified</option>
          <option value="no">Email pending</option>
        </select>
        <select
          className="rounded-md border bg-white px-3"
          value={googleFilter}
          onChange={(e) => setGoogleFilter(e.target.value)}
        >
          <option value="">Any login method</option>
          <option value="yes">Google linked</option>
          <option value="no">Google not linked</option>
        </select>
        <select
          className="rounded-md border bg-white px-3"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option>active</option>
          <option>disabled</option>
        </select>
        <Button variant="outline" onClick={load}>
          Apply filters
        </Button>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-[#f6f8f1]">
              <th className="p-4">Account</th>
              <th className="p-4">Role</th>
              <th className="p-4">Security</th>
              <th className="p-4">Google</th>
              <th className="p-4">Workspaces</th>
              <th className="p-4">Last login / IP</th>
              <th className="p-4">Created</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id} className="border-b last:border-0">
                <td className="p-4">
                  <Link
                    className="font-medium underline-offset-4 hover:underline"
                    href={`/admin/accounts/${account.id}`}
                  >
                    {account.email}
                  </Link>
                </td>
                <td className="p-4">
                  <select
                    className="rounded-md border p-2"
                    value={account.platformRole || "customer"}
                    disabled={busy || !canManage}
                    onChange={(e) =>
                      update(account, {
                        platformRole: e.target.value === "customer" ? null : e.target.value,
                      })
                    }
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {role.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-4 text-xs">
                  Email {account.emailVerifiedAt ? "verified" : "pending"}
                  <br />
                  MFA {account.mfaConfirmedAt ? "enabled" : "required"}
                  {account.riskFlags?.length > 0 && (
                    <span className="mt-2 block font-semibold text-red-700">
                      {account.riskFlags.join(" · ")}
                    </span>
                  )}
                </td>
                <td className="p-4">{account.googleLinked ? "Linked" : "Not linked"}</td>
                <td className="p-4">{account.workspaceCount}</td>
                <td className="p-4 text-xs">
                  {account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : "Never"}
                  <br />
                  {account.lastLoginIp || "—"}
                </td>
                <td className="p-4 text-xs">{new Date(account.createdAt).toLocaleDateString()}</td>
                <td className="p-4">{account.status}</td>
                <td className="p-4">
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          update(account, {
                            status: account.status === "active" ? "disabled" : "active",
                          })
                        }
                      >
                        {account.status === "active" ? "Disable" : "Enable"}
                      </Button>
                      {account.mfaConfirmedAt && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => resetMfa(account)}
                        >
                          Reset MFA
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => accountAction(account, "revoke_sessions")}
                      >
                        Revoke sessions
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => accountAction(account, "force_password_reset")}
                      >
                        Force reset
                      </Button>
                      {!account.emailVerifiedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => accountAction(account, "resend_verification")}
                        >
                          Resend verification
                        </Button>
                      )}
                      {account.googleLinked && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => accountAction(account, "remove_google")}
                        >
                          Remove Google
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
