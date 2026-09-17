"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
export function ServiceStatus() {
  const [state, setState] = useState("loading");
  useEffect(() => {
    fetch("/control-api/health/ready", { cache: "no-store" })
      .then((response) => setState(response.ok ? "operational" : "degraded"))
      .catch(() => setState("degraded"));
  }, []);
  const good = state === "operational";
  return (
    <div className="mx-auto max-w-7xl px-5 py-16 md:px-8">
      <div className="rounded-[28px] border border-[#dce3d5] bg-white p-8">
        <div className="flex items-center gap-4">
          {state === "loading" ? (
            <LoaderCircle className="animate-spin text-[#78944f]" />
          ) : good ? (
            <CheckCircle2 className="text-[#78944f]" />
          ) : (
            <CircleAlert className="text-amber-600" />
          )}
          <div>
            <h2 className="text-xl font-semibold">
              {state === "loading"
                ? "Checking services…"
                : good
                  ? "Control API operational"
                  : "Service check degraded"}
            </h2>
            <p className="mt-1 text-sm text-[#687362]">
              Live readiness check from the Unpirator control API.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
