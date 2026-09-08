"use client";

import { CheckCircle2, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Surface } from "@/components/console-kit";

const frameworks = {
  nextjs: `import { UnpiratorPlayer } from "@unpirator/player";\n\n<UnpiratorPlayer assetId="YOUR_ASSET_ID" tokenEndpoint="/api/playback" />`,
  php: `$session = $client->createPlaybackSession([\n  'assetId' => 'YOUR_ASSET_ID',\n  'userId' => $currentUser->id,\n]);`,
  custom: `POST /v1/playback/sessions\nAuthorization: Bearer YOUR_API_KEY\nIdempotency-Key: UNIQUE_REQUEST_ID`,
};

export default function IntegrationPage() {
  const [framework, setFramework] = useState("nextjs");
  const [summary, setSummary] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api("/v1/workspace/summary")
      .then(setSummary)
      .catch(() => setSummary({ counts: {} }));
  }, []);
  const readiness = useMemo(
    () => [
      ["Verified site", Number(summary?.counts?.verifiedSites || 0) > 0],
      ["Provider connection", Number(summary?.counts?.connections || 0) > 0],
      ["Registered asset", Number(summary?.counts?.assets || 0) > 0],
      ["Active API key", Number(summary?.counts?.apiKeys || 0) > 0],
    ],
    [summary],
  );
  async function copySample() {
    await navigator.clipboard.writeText(frameworks[framework]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Developer setup"
        title="Integration"
        description="Connect protected playback to your application and verify every prerequisite before going live."
        action={
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold"
          >
            Full documentation <ExternalLink size={15} />
          </Link>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
        <Surface className="p-6">
          <h2 className="font-semibold">Readiness</h2>
          <div className="mt-5 space-y-3">
            {readiness.map(([label, done]) => (
              <div
                className="flex items-center justify-between rounded-xl bg-[#f6f8f2] p-4 text-sm"
                key={label}
              >
                <span>{label}</span>
                <CheckCircle2 size={18} className={done ? "text-emerald-600" : "text-[#c2c9ba]"} />
              </div>
            ))}
          </div>
        </Surface>
        <Surface className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <div>
              <h2 className="font-semibold">Starter sample</h2>
              <p className="mt-1 text-xs text-[#74806d]">Use server-side credentials only.</p>
            </div>
            <select
              className="rounded-xl border bg-white px-3 py-2 text-sm"
              value={framework}
              onChange={(event) => setFramework(event.target.value)}
            >
              <option value="nextjs">Next.js</option>
              <option value="php">PHP / Laravel</option>
              <option value="custom">Custom HTTP</option>
            </select>
          </div>
          <div className="relative bg-[#172014] p-6">
            <pre className="overflow-auto text-xs leading-6 text-[#e8f2d5]">
              <code>{frameworks[framework]}</code>
            </pre>
            <button
              onClick={copySample}
              className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs text-white"
            >
              <Copy size={14} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </Surface>
      </div>
    </div>
  );
}
