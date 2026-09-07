"use client";
import { UserPlus, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusPill, Surface } from "@/components/console-kit";
const roles = ["viewer", "developer", "admin", "owner"];

export default function TeamPage() {
  return (
    <Suspense fallback={<div className="min-h-[320px]" />}>
      <TeamContent />
    </Suspense>
  );
}

function TeamContent() {
  const params = useSearchParams();
  const [members, setMembers] = useState([]),
    [invites, setInvites] = useState([]),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("viewer"),
    [message, setMessage] = useState("");
  const load = () =>
    api("/v1/workspace/team").then((d) => {
      setMembers(d.members || []);
      setInvites(d.invitations || []);
    });
  useEffect(() => {
    const token = params.get("invite");
    (async () => {
      try {
        if (token) {
          await api("/v1/workspace/invitations/accept", {
            method: "POST",
            body: JSON.stringify({ token }),
          });
          setMessage("Invitation accepted.");
        }
        await load();
      } catch (e) {
        setMessage(e.message);
      }
    })();
  }, []);
  async function invite(e) {
    e.preventDefault();
    try {
      await api("/v1/workspace/team/invitations", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setEmail("");
      setMessage("Invitation sent.");
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }
  async function change(id, next) {
    try {
      await api(`/v1/workspace/team/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: next }),
      });
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function remove(id) {
    if (!confirm("Remove this workspace member?")) return;
    try {
      await api(`/v1/workspace/team/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace access"
        title="Team"
        description="Invite collaborators and control workspace roles without sharing owner credentials."
      />
      {message && (
        <div className="rounded-2xl border border-[#dce3d4] bg-white p-4 text-sm text-[#52604b]">
          {message}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <Surface className="p-6">
          <h2 className="font-semibold">Invite member</h2>
          <form className="mt-5 space-y-4" onSubmit={invite}>
            <label className="block text-sm font-medium">
              Email
              <Input
                className="mt-2"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Role
              <select
                className="mt-2 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <Button className="w-full">
              <UserPlus size={15} />
              Send invitation
            </Button>
          </form>
          {invites.length > 0 && (
            <div className="mt-6 border-t pt-5">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-[#71805b]">
                Pending/recent invites
              </p>
              {invites.slice(0, 6).map((i) => (
                <div key={i.id} className="mt-3 rounded-xl bg-[#f7f9f2] p-3 text-sm">
                  <b>{i.email}</b>
                  <p className="text-xs text-[#7d8876]">
                    {i.role} · {i.acceptedAt ? "accepted" : "pending"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Surface>
        <Surface className="overflow-hidden">
          <div className="divide-y divide-[#edf0e9]">
            {members.map((m) => (
              <div
                key={m.accountId}
                className="grid gap-3 p-5 md:grid-cols-[1fr_150px_auto] md:items-center"
              >
                <div>
                  <p className="font-semibold">{m.email}</p>
                  <p className="mt-1 text-xs text-[#7d8876]">
                    Joined {new Date(m.joinedAt).toLocaleDateString()}
                  </p>
                </div>
                <select
                  className="rounded-xl border border-[#dfe4d6] bg-white px-3 py-2 text-sm"
                  value={m.role}
                  onChange={(e) => change(m.accountId, e.target.value)}
                >
                  {roles.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <StatusPill status={m.emailVerifiedAt ? "verified" : "unverified"} />
                  <Button size="sm" variant="outline" onClick={() => remove(m.accountId)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}
