"use client";

import { Save, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusPill, Surface } from "@/components/console-kit";

const labels = { bkash: "bKash", nagad: "Nagad", rocket: "Rocket" };

export default function AdminPaymentMethodsPage() {
  const [items, setItems] = useState([]);
  const [type, setType] = useState("bkash");
  const [displayName, setDisplayName] = useState("bKash");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("Personal");
  const [instructions, setInstructions] = useState("");
  const [message, setMessage] = useState("");

  const load = () => api("/v1/admin/commerce/payment-methods").then((data) => setItems(data.items || []));
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    try {
      await api("/v1/admin/commerce/payment-methods", {
        method: "POST",
        body: JSON.stringify({
          type,
          displayName,
          accountNumber,
          accountName: accountName || null,
          accountType: accountType || null,
          instructions: instructions || null,
          enabled: true,
          sortOrder: { bkash: 10, nagad: 20, rocket: 30 }[type],
          minAmountMinor: null,
          maxAmountMinor: null,
        }),
      });
      setMessage(`${displayName} configured.`);
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }

  async function toggle(item) {
    try {
      await api(`/v1/admin/commerce/payment-methods/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revenue configuration"
        title="Payment methods"
        description="Control exactly which local wallets customers can use. Wallet-number changes require the current privileged admin session."
      />
      {message && <div className="rounded-2xl border border-[#dce3d4] bg-white p-4 text-sm">{message}</div>}

      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <Surface className="p-6">
          <h2 className="font-semibold">Configure wallet</h2>
          <form className="mt-5 space-y-4" onSubmit={save}>
            <label className="block text-sm font-medium">
              Provider
              <select
                className="mt-2 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm"
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setDisplayName(labels[e.target.value]);
                }}
              >
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="rocket">Rocket</option>
              </select>
            </label>
            <label className="block text-sm font-medium">Display name<Input className="mt-2" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
            <label className="block text-sm font-medium">Account number<Input className="mt-2" required value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></label>
            <label className="block text-sm font-medium">Account name<Input className="mt-2" value={accountName} onChange={(e) => setAccountName(e.target.value)} /></label>
            <label className="block text-sm font-medium">Account type<Input className="mt-2" value={accountType} onChange={(e) => setAccountType(e.target.value)} /></label>
            <label className="block text-sm font-medium">
              Customer instructions
              <textarea className="mt-2 min-h-24 w-full rounded-xl border border-[#dfe4d6] p-3 text-sm" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </label>
            <Button><Save size={15} /> Save wallet</Button>
          </form>
        </Surface>

        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <Surface key={item.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-[#edf5d8] text-[#536b31]"><WalletCards size={18} /></span>
                <StatusPill status={item.enabled ? "active" : "disabled"} />
              </div>
              <h2 className="mt-6 font-semibold">{item.displayName}</h2>
              <p className="mt-1 font-mono text-lg">{item.accountNumber}</p>
              <p className="mt-2 text-xs text-[#7d8876]">{item.accountType || "Account"} · {item.accountName || "No account name"}</p>
              <Button className="mt-5" size="sm" variant="outline" onClick={() => toggle(item)}>
                {item.enabled ? "Disable" : "Enable"}
              </Button>
            </Surface>
          ))}
          {items.length === 0 && <p className="text-sm text-[#7b8574]">No manual payment method configured.</p>}
        </div>
      </div>
    </div>
  );
}
