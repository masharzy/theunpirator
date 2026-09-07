"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DataPage } from "@/components/data-page";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
export default function Admin() {
  const auth = useAuth();
  const [tenants, setTenants] = useState([]),
    [accounts, setAccounts] = useState([]),
    [providers, setProviders] = useState([]),
    [flags, setFlags] = useState([]),
    [tab, setTab] = useState("customers"),
    [message, setMessage] = useState(""),
    [inviteEmail, setInviteEmail] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    Promise.all([
      api("/v1/admin/tenants"),
      api("/v1/admin/accounts"),
      api("/v1/admin/providers"),
      api("/v1/admin/features"),
    ])
      .then(([t, a, p, f]) => {
        setTenants(t.items);
        setAccounts(a.items);
        setProviders(p.items);
        setFlags(f.items);
      })
      .catch((e) => setMessage(e.message));
  useEffect(() => {
    load();
  }, []);
  async function action(path, body, method = "PUT") {
    setBusy(true);
    setMessage("");
    try {
      await api(path, { method, body: JSON.stringify(body) });
      setMessage("Change saved.");
      await load();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function changeAccount(account, values) {
    const reason = window.prompt("Reason for this access change (minimum 8 characters)");
    if (!reason) return;
    await action(`/v1/admin/accounts/${account.id}`, { ...values, reason }, "PATCH");
  }
  async function createAccount(event) {
    event.preventDefault();
    const reason = window.prompt(
      "Reason for creating this platform account (minimum 8 characters)",
    );
    if (!reason) return;
    await action("/v1/admin/accounts", { email: inviteEmail, reason }, "POST");
    setInviteEmail("");
  }
  async function resetMfa(account) {
    const reason = window.prompt("Reason for resetting MFA (minimum 8 characters)");
    if (!reason) return;
    await action(`/v1/admin/accounts/${account.id}/mfa-reset`, { reason }, "POST");
  }
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-muted-foreground">
            The Unpirator
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">Platform administration</h1>
        </div>
        <Link className="text-sm underline" href="/dashboard">
          Workspace
        </Link>
      </div>
      <nav className="my-8 flex flex-wrap gap-2" aria-label="Admin sections">
        {[
          "customers",
          "accounts",
          "providers",
          "features",
          "subscriptions",
          "audit",
          "security",
        ].map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </nav>
      {message && (
        <p role="status" className="mb-5 rounded-lg border bg-white p-4 text-sm">
          {message}
        </p>
      )}
      {tab === "customers" && (
        <div className="space-y-4">
          {tenants.length === 0 ? (
            <p>No workspaces yet.</p>
          ) : (
            tenants.map((t) => (
              <section key={t.id} className="rounded-xl border bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">{t.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.id} · {t.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        action(
                          `/v1/admin/tenants/${t.id}/status`,
                          { status: t.status === "active" ? "suspended" : "active" },
                          "PATCH",
                        )
                      }
                    >
                      {t.status === "active" ? "Suspend" : "Enable"}
                    </Button>
                    <Button
                      disabled={busy}
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        action(`/v1/admin/tenants/${t.id}/revoke-sessions`, {}, "POST")
                      }
                    >
                      Revoke sessions
                    </Button>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="mr-2 text-xs text-muted-foreground">Assign plan</span>
                  {["starter", "pro", "business"].map((p) => (
                    <Button
                      key={p}
                      disabled={busy}
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        action(`/v1/admin/tenants/${t.id}/subscription`, { planId: p })
                      }
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}
      {tab === "accounts" && (
        <div className="space-y-4">
          <form onSubmit={createAccount} className="flex gap-2 rounded-xl border bg-white p-5">
            <input
              className="min-w-0 flex-1 rounded-md border px-3 py-2"
              type="email"
              placeholder="new-admin@example.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
            />
            <Button disabled={busy}>Create account</Button>
          </form>
          {accounts.map((account) => (
            <section key={account.id} className="rounded-xl border bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{account.email}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {account.platformRole || "customer"} · {account.status} · Email{" "}
                    {account.emailVerifiedAt ? "verified" : "unverified"} · MFA{" "}
                    {account.mfaConfirmedAt ? "ready" : "not configured"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {account.platformRole !== "super_admin" ? (
                    <Button
                      disabled={busy || !account.emailVerifiedAt}
                      onClick={() =>
                        changeAccount(account, { platformRole: "super_admin", status: "active" })
                      }
                    >
                      Promote
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => changeAccount(account, { platformRole: null })}
                    >
                      Demote
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      changeAccount(account, {
                        status: account.status === "active" ? "disabled" : "active",
                      })
                    }
                  >
                    {account.status === "active" ? "Disable" : "Enable"}
                  </Button>
                  {account.mfaConfirmedAt && account.id !== auth?.account?.id && (
                    <Button variant="destructive" disabled={busy} onClick={() => resetMfa(account)}>
                      Reset MFA
                    </Button>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
      {tab === "providers" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {providers.map((p) => (
            <section className="rounded-xl border bg-white p-5" key={p.provider}>
              <h2 className="font-semibold">{p.provider}</h2>
              <p className="my-3 text-sm text-muted-foreground">{p.status}</p>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() =>
                  action(
                    `/v1/admin/providers/${p.provider}/status`,
                    { status: p.status === "disabled" ? "healthy" : "disabled" },
                    "PATCH",
                  )
                }
              >
                {p.status === "disabled" ? "Enable provider" : "Disable provider"}
              </Button>
              {p.provider === "youtube_custom" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Adapter is a disabled stub. An authorized custom implementation is required.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
      {tab === "features" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {flags
            .filter((f) => f.scopeType === "global")
            .map((f) => (
              <section key={f.id} className="rounded-xl border bg-white p-5">
                <h2 className="font-semibold">{f.key}</h2>
                <p className="my-3 text-sm text-muted-foreground">
                  Global gate: {f.enabled ? "enabled" : "disabled"}
                </p>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => action(`/v1/admin/features/${f.key}`, { enabled: !f.enabled })}
                >
                  {f.enabled ? "Disable" : "Enable"}
                </Button>
              </section>
            ))}
        </div>
      )}
      {["subscriptions", "audit", "security"].includes(tab) && (
        <DataPage
          key={tab}
          title={tab.charAt(0).toUpperCase() + tab.slice(1)}
          description="Platform-wide records. Access is restricted to Super Admin."
          endpoint={`/v1/admin/${tab}`}
        />
      )}
    </main>
  );
}
