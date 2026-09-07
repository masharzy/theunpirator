"use client";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, StatusPill, Surface, money } from "@/components/console-kit";

export default function PlansPage() {
  const [plans, setPlans] = useState([]),
    [billing, setBilling] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api("/v1/billing/plans"), api("/v1/billing")])
      .then(([p, b]) => {
        setPlans(p.items || []);
        setBilling(b);
      })
      .catch((e) => setError(e.message));
  }, []);
  const current = billing?.subscription?.planId;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Subscription"
        title="Plans"
        description="Choose the protection capacity that fits your workspace. Payments are verified manually through enabled local methods."
        action={billing?.subscription ? <StatusPill status={billing.subscription.status} /> : null}
      />
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const active = current === plan.id;
          const configured = Number(plan.priceMinor) > 0;
          return (
            <Surface
              key={plan.id}
              className={`relative p-6 ${active ? "ring-2 ring-[#91a96b]" : ""}`}
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-[#edf5d8] text-[#536b31]">
                <Sparkles size={18} />
              </span>
              <h2 className="mt-6 text-xl font-semibold">{plan.name}</h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-[#74806d]">
                {plan.description || "Protected media controls for your workspace."}
              </p>
              <p className="mt-5 text-3xl font-semibold">
                {configured ? money(plan.priceMinor, plan.currency) : "Admin pricing"}
              </p>
              <p className="mt-1 text-xs text-[#87917f]">{plan.durationDays || 30} days</p>
              <div className="mt-6 space-y-2">
                {Object.entries(plan.entitlements || {})
                  .slice(0, 7)
                  .map(([k, v]) => (
                    <p key={k} className="flex gap-2 text-sm text-[#596551]">
                      <Check size={15} className="mt-0.5 text-[#78944f]" />
                      <span>
                        {k.replaceAll("_", " ")}:{" "}
                        {typeof v === "boolean" ? (v ? "Included" : "No") : String(v)}
                      </span>
                    </p>
                  ))}
              </div>
              {active ? (
                <div className="mt-7 rounded-xl bg-[#edf5d8] px-4 py-3 text-center text-sm font-semibold text-[#4c632d]">
                  Current plan
                </div>
              ) : configured ? (
                <Link
                  className="mt-7 flex justify-center rounded-xl bg-[#172014] px-4 py-3 text-sm font-semibold text-white"
                  href={`/dashboard/payments?plan=${encodeURIComponent(plan.id)}`}
                >
                  Choose {plan.name}
                </Link>
              ) : (
                <div className="mt-7 rounded-xl border border-dashed p-3 text-center text-xs text-[#7b8574]">
                  Admin must configure price first
                </div>
              )}
            </Surface>
          );
        })}
      </div>
    </div>
  );
}
