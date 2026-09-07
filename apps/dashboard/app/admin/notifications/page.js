"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader, Surface } from "@/components/console-kit";
import { useAuth } from "@/components/auth-provider";

export default function AdminNotificationsPage() {
  const auth = useAuth();
  const canManage = auth?.account?.platformRole !== "auditor";
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
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
      {message && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {message}
        </div>
      )}
      <Surface className="overflow-hidden">
        {items.length ? (
          <div className="divide-y divide-[#edf0e9]">
            {items.map((item) => (
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
                {canManage && !item.readAt && (
                  <Button size="sm" onClick={() => read(item.id)}>
                    Mark read
                  </Button>
                )}
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
