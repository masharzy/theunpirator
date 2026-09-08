"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";

const tabs = [
  "overview",
  "members",
  "sites",
  "connections",
  "assets",
  "viewers",
  "devices",
  "sessions",
  "usage",
  "subscription",
  "payments",
  "security",
  "audit",
  "notes",
  "features",
  "restricted",
];
export function WorkspaceAdminTools({ tenantId, section }) {
  const auth = useAuth();
  const role = auth?.account?.platformRole;
  const [message, setMessage] = useState("");
  async function action(kind) {
    try {
      if (kind === "note") {
        const body = prompt("Internal support note");
        if (!body) return;
        await api(`/v1/admin/tenants/${tenantId}/notes`, {
          method: "POST",
          body: JSON.stringify({ body }),
        });
      }
      if (kind === "revoke" && confirm("Revoke every active playback session?"))
        await api(`/v1/admin/tenants/${tenantId}/revoke-sessions`, { method: "POST" });
      if (["suspend", "activate"].includes(kind)) {
        const reason = prompt("Reason for status change (minimum 8 characters)");
        if (!reason) return;
        await api(`/v1/admin/tenants/${tenantId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: kind === "suspend" ? "suspended" : "active", reason }),
        });
      }
      if (kind === "extend") {
        const days = Number(prompt("Extend subscription by how many days?"));
        const reason = prompt("Reason (minimum 8 characters)");
        if (!days || !reason) return;
        await api(`/v1/admin/tenants/${tenantId}/subscription/extend`, {
          method: "POST",
          body: JSON.stringify({ days, reason }),
        });
      }
      if (kind === "plan") {
        const planId = prompt("Plan ID: starter, pro or business");
        const reason = prompt("Reason (minimum 8 characters)");
        if (!planId || !reason) return;
        await api(`/v1/admin/tenants/${tenantId}/subscription`, {
          method: "PUT",
          body: JSON.stringify({ planId, status: "active", reason }),
        });
      }
      if (kind === "feature") {
        const key = prompt("Feature key to override");
        const enabled = confirm("Enable this feature? Cancel will disable it.");
        const reason = prompt("Reason (minimum 8 characters)");
        if (!key || !reason) return;
        await api(`/v1/admin/tenants/${tenantId}/features/${key}`, {
          method: "PUT",
          body: JSON.stringify({ enabled, reason }),
        });
      }
      if (kind === "usage") {
        const metric = prompt(
          "Quota metric: monthly_gateway_requests, monthly_egress_bytes or monthly_playback_minutes",
        );
        const limit = Number(prompt("New limit"));
        const reason = prompt("Reason (minimum 8 characters)");
        if (!metric || !limit || !reason) return;
        await api(`/v1/admin/tenants/${tenantId}/usage-override`, {
          method: "PUT",
          body: JSON.stringify({ metric, limit, reason }),
        });
      }
      if (kind === "plan") {
        const planId = prompt("Plan: starter, pro or business");
        const reason = prompt("Reason (minimum 8 characters)");
        if (!planId || !reason) return;
        await api(`/v1/admin/tenants/${tenantId}/subscription`, {
          method: "PUT",
          body: JSON.stringify({ planId, status: "active", reason }),
        });
      }
      if (kind === "feature") {
        const key = prompt("Feature key");
        if (!key) return;
        const enabled = confirm("Enable this feature? Cancel means disable.");
        await api(`/v1/admin/tenants/${tenantId}/features/${key}`, {
          method: "PUT",
          body: JSON.stringify({ enabled }),
        });
      }
      if (kind === "impersonate") {
        const reason = prompt("Support reason (minimum 8 characters)");
        if (!reason) return;
        await api(`/v1/admin/tenants/${tenantId}/impersonate`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        });
        location.href = "/dashboard";
      }
      setMessage("Action completed.");
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <div className="mb-7 rounded-2xl border border-[#d9dfce] bg-[#f8f7f0] p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={`/admin/workspaces/${tenantId}/${tab}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${section === tab ? "bg-[#172014] text-white" : "bg-white text-[#5f6958] ring-1 ring-[#dce1d5]"}`}
          >
            {tab}
          </Link>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {["super_admin", "operations_admin"].includes(role) && (
          <>
            <button
              onClick={() => action("suspend")}
              className="rounded-xl bg-[#9f3024] px-4 py-2 text-xs font-bold text-white"
            >
              Suspend workspace
            </button>
            <button
              onClick={() => action("activate")}
              className="rounded-xl border bg-white px-4 py-2 text-xs font-bold"
            >
              Unsuspend
            </button>
          </>
        )}
        {["super_admin", "billing_admin"].includes(role) && (
          <>
            <button
              onClick={() => action("plan")}
              className="rounded-xl border bg-white px-4 py-2 text-xs font-bold"
            >
              Change plan
            </button>
            <button
              onClick={() => action("extend")}
              className="rounded-xl border bg-white px-4 py-2 text-xs font-bold"
            >
              Extend subscription
            </button>
          </>
        )}
        {["super_admin", "billing_admin"].includes(role) && (
          <button
            onClick={() => action("usage")}
            className="rounded-xl border bg-white px-4 py-2 text-xs font-bold"
          >
            Usage override
          </button>
        )}
        {["super_admin", "operations_admin", "security_admin"].includes(role) && (
          <button
            onClick={() => action("feature")}
            className="rounded-xl border bg-white px-4 py-2 text-xs font-bold"
          >
            Feature override
          </button>
        )}
        {["super_admin", "support_admin", "security_admin"].includes(role) && (
          <button
            onClick={() => action("revoke")}
            className="rounded-xl border bg-white px-4 py-2 text-xs font-bold"
          >
            Revoke sessions
          </button>
        )}
        {["super_admin", "support_admin"].includes(role) && (
          <>
            <button
              onClick={() => action("note")}
              className="rounded-xl border bg-white px-4 py-2 text-xs font-bold"
            >
              Add support note
            </button>
            <button
              onClick={() => action("impersonate")}
              className="rounded-xl bg-[#607a39] px-4 py-2 text-xs font-bold text-white"
            >
              View as workspace
            </button>
          </>
        )}
        {message && <span className="self-center text-xs text-[#657154]">{message}</span>}
      </div>
    </div>
  );
}
