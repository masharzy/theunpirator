"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader, Surface } from "@/components/console-kit";

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");

  const load = () => api("/v1/billing/notifications").then((data) => setItems(data.items || []));

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  async function markRead(id) {
    try {
      await api(`/v1/billing/notifications/${id}/read`, { method: "PATCH" });
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace inbox"
        title="Notifications"
        description="Payment, plan and workspace events that need your attention."
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
                className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between ${
                  item.readAt ? "bg-white" : "bg-[#f5f9eb]"
                }`}
              >
                <div className="flex min-w-0 gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eaf5cf] text-[#536b31]">
                    <Bell size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-[#6f7a68]">{item.body}</p>
                    <p className="mt-2 text-xs text-[#929b8c]">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.actionUrl && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={item.actionUrl}>Open</Link>
                    </Button>
                  )}
                  {!item.readAt && (
                    <Button size="sm" onClick={() => markRead(item.id)}>
                      <CheckCheck size={15} /> Mark read
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center p-8 text-center text-sm text-[#7b8574]">
            No notifications yet.
          </div>
        )}
      </Surface>
    </div>
  );
}
