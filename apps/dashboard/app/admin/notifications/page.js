"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader, Surface } from "@/components/console-kit";
import { useAuth } from "@/components/auth-provider";

export default function AdminNotificationsPage() {
  const auth = useAuth();
  const canManage = auth?.account?.platformRole !== "auditor";
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const load = () => api("/v1/admin/commerce/notifications").then((d) => setItems(d.items || []));
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  async function read(id) {
    try {
      await api(`/v1/admin/commerce/notifications/${id}/read`, { method: "PATCH" });
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operations inbox"
        title="Admin notifications"
        description="Payment, subscription and platform events that need operator attention."
      />
      <div className="flex gap-2">
        {["all", "unread", "security_incident", "webhook_failed", "payment_review_required"].map(
          (value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${filter === value ? "bg-[#172014] text-white" : "border bg-white"}`}
            >
              {value.replaceAll("_", " ")}
            </button>
          ),
        )}
      </div>
      {message && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {message}
        </div>
      )}
      <Surface className="overflow-hidden">
        {items.length ? (
          <div className="divide-y divide-[#edf0e9]">
            {items
              .filter(
                (item) =>
                  filter === "all" || (filter === "unread" ? !item.readAt : item.type === filter),
              )
              .map((item) => (
                <div
                  key={item.id}
                  className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between ${item.readAt ? "bg-white" : "bg-[#f5f9eb]"}`}
                >
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-[#6f7a68]">{item.body}</p>
                    <p className="mt-2 text-xs text-[#929b8c]">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {item.actionUrl && (
                      <Link
                        className="rounded-lg border px-3 py-2 text-xs font-bold"
                        href={item.actionUrl}
                      >
                        Open
                      </Link>
                    )}
                    {canManage && !item.readAt && (
                      <Button size="sm" onClick={() => read(item.id)}>
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="p-8 text-sm text-[#7b8574]">No admin notifications yet.</p>
        )}
      </Surface>
    </div>
  );
}
