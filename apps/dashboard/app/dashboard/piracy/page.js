"use client";

import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileDown,
  Plus,
  Radar,
  Send,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Surface } from "@/components/console-kit";

const PLATFORMS = [
  { id: "telegram", label: "Telegram" },
  { id: "youtube", label: "YouTube" },
  { id: "facebook", label: "Facebook" },
  { id: "web_host", label: "Web host" },
];

const CASE_STATUSES = ["detected", "notice_sent", "removed", "rejected", "withdrawn"];

const STATUS_STYLES = {
  active: "bg-[#fdeaea] text-[#a33b3b] ring-[#f3cdcd]",
  false_positive: "bg-[#f1f2ee] text-[#7b8574] ring-[#e2e7dc]",
  detected: "bg-[#fdf3e3] text-[#9a6b1f] ring-[#f0e0bd]",
  notice_sent: "bg-[#e8f0fb] text-[#3a6398] ring-[#cfdff2]",
  removed: "bg-[#eef5df] text-[#5a7433] ring-[#d6e2ba]",
  rejected: "bg-[#fdeaea] text-[#a33b3b] ring-[#f3cdcd]",
  withdrawn: "bg-[#f1f2ee] text-[#7b8574] ring-[#e2e7dc]",
};

function StatusBadge({ value }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ring-1 ${
        STATUS_STYLES[value] || "bg-[#f1f2ee] text-[#7b8574] ring-[#e2e7dc]"
      }`}
    >
      {value?.replace("_", " ")}
    </span>
  );
}

const fromCsv = (text) =>
  text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

function WatchlistForm({ onCreated }) {
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [channels, setChannels] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/v1/piracy/watchlists", {
        method: "POST",
        body: JSON.stringify({
          name,
          keywords: fromCsv(keywords),
          telegramChannels: fromCsv(channels),
        }),
      });
      setName("");
      setKeywords("");
      setChannels("");
      onCreated();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <div className="grid gap-3 sm:grid-cols-3 sm:col-span-2">
        <Input
          required
          minLength={2}
          placeholder="Watchlist name, e.g. HSC 24 batch"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          required
          placeholder="Keywords, comma separated"
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
        />
        <Input
          placeholder="Telegram channels (public @handles), optional"
          value={channels}
          onChange={(event) => setChannels(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={busy} className="sm:w-auto">
        <Plus className="h-4 w-4" /> Add watchlist
      </Button>
      {error ? (
        <p className="text-xs text-[#a33b3b] sm:col-span-2" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function WatchlistCard({ watchlist, onChanged }) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await api(`/v1/piracy/watchlists/${watchlist.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !watchlist.enabled }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete watchlist "${watchlist.name}"? Findings are kept.`)) return;
    setBusy(true);
    try {
      await api(`/v1/piracy/watchlists/${watchlist.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#dfe5d8] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#263120]">{watchlist.name}</p>
          <p className="mt-1 text-xs text-[#7b8574]">
            {watchlist.keywords.length} keywords · {watchlist.telegramChannels.length} Telegram
            channels
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge value={watchlist.enabled ? "active" : "false_positive"} />
          <Button size="sm" variant="outline" disabled={busy} onClick={toggle}>
            {watchlist.enabled ? "Pause" : "Resume"}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {watchlist.keywords.map((keyword) => (
          <span
            key={keyword}
            className="rounded-full bg-[#f3f5ef] px-2.5 py-1 text-xs text-[#465041]"
          >
            {keyword}
          </span>
        ))}
        {watchlist.telegramChannels.map((channel) => (
          <a
            key={channel}
            href={`https://t.me/${channel}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-[#e8f0fb] px-2.5 py-1 text-xs text-[#3a6398] hover:underline"
          >
            t.me/{channel}
          </a>
        ))}
      </div>
    </div>
  );
}

function ReportFindingForm({ onReported }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/v1/piracy/findings/manual", {
        method: "POST",
        body: JSON.stringify({ url, title: title || undefined }),
      });
      setUrl("");
      setTitle("");
      onReported();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <Input
        required
        type="url"
        placeholder="https://leaked-link.example/course"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      <Input
        placeholder="What is it? (optional)"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button type="submit" disabled={busy}>
        Report link
      </Button>
      {error ? (
        <p className="text-xs text-[#a33b3b] sm:col-span-3" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function TakedownNoticePanel({ caseId }) {
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setNotice(null);
    setError("");
    api(`/v1/piracy/cases/${caseId}/notice`)
      .then((data) => {
        if (!cancelled) setNotice(data.notice);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught.message);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const download = () => {
    const blob = new Blob([notice.body], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `dmca-notice-${caseId.slice(0, 8)}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (error) return <p className="text-xs text-[#a33b3b]">{error}</p>;
  if (!notice) return <p className="text-xs text-[#7b8574]">Loading notice…</p>;
  return (
    <div className="mt-2 rounded-xl border border-[#e1e6da] bg-[#fbfcf8] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#263120]">
          {notice.platformLabel} — send via {notice.channel === "email" ? notice.to : "web form"}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(notice.body);
            }}
          >
            Copy
          </Button>
          <Button size="sm" variant="outline" onClick={download}>
            <FileDown className="h-3.5 w-3.5" /> Download
          </Button>
        </div>
      </div>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[#465041]">
        {notice.body}
      </pre>
      <p className="mt-2 text-xs text-[#7b8574]">{notice.instructions}</p>
    </div>
  );
}

function FindingCard({ finding, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState(finding.source === "telegram" ? "telegram" : "web_host");
  const [noticeFor, setNoticeFor] = useState(null);

  const openCase = async () => {
    setBusy(true);
    try {
      const data = await api(`/v1/piracy/findings/${finding.id}/cases`, {
        method: "POST",
        body: JSON.stringify({ platform }),
      });
      setNoticeFor(data.case.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const markFalsePositive = async () => {
    setBusy(true);
    try {
      await api(`/v1/piracy/findings/${finding.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "false_positive" }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const cases = finding.cases || [];

  return (
    <div className="rounded-2xl border border-[#dfe5d8] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={finding.status} />
            <span className="rounded-full bg-[#f3f5ef] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#7a8473]">
              {finding.source}
            </span>
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-[#263120]">
            {finding.title || "(untitled)"}
          </p>
          <a
            href={finding.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex items-center gap-1 break-all text-xs text-[#3a6398] hover:underline"
          >
            {finding.url} <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
          {finding.snippet ? (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#7b8574]">{finding.snippet}</p>
          ) : null}
          <p className="mt-2 text-[11px] text-[#879080]">
            First seen {new Date(finding.firstSeenAt).toLocaleDateString()} · last seen{" "}
            {new Date(finding.lastSeenAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Takedown ({cases.length})
          </Button>
          {finding.status === "active" ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={markFalsePositive}>
              <ShieldOff className="h-3.5 w-3.5" /> Not a leak
            </Button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="mt-4 border-t border-[#e6eadf] pt-4">
          {cases.map((caseRow) => (
            <div key={caseRow.id} className="mb-3 rounded-xl border border-[#e1e6da] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge value={caseRow.status} />
                  <span className="text-xs font-semibold text-[#263120]">
                    {PLATFORMS.find((item) => item.id === caseRow.platform)?.label ||
                      caseRow.platform}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {CASE_STATUSES.filter((status) => status !== caseRow.status).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api(`/v1/piracy/cases/${caseRow.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ status }),
                          });
                          onChanged();
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {status === "notice_sent" ? <Send className="h-3 w-3" /> : null}
                      {status.replace("_", " ")}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setNoticeFor(noticeFor === caseRow.id ? null : caseRow.id)}
                  >
                    <FileDown className="h-3.5 w-3.5" /> Notice
                  </Button>
                </div>
              </div>
              {noticeFor === caseRow.id ? <TakedownNoticePanel caseId={caseRow.id} /> : null}
            </div>
          ))}

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-[#465041]">
              New takedown case
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                className="mt-1 block rounded-xl border border-[#e1e6da] bg-white px-3 py-2 text-xs text-[#263120]"
              >
                {PLATFORMS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" disabled={busy} onClick={openCase}>
              Open case & draft notice
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PiracyPage() {
  const [watchlists, setWatchlists] = useState(null);
  const [findings, setFindings] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [watchlistData, findingData] = await Promise.all([
        api("/v1/piracy/watchlists"),
        api(
          `/v1/piracy/findings?limit=100${statusFilter ? `&status=${statusFilter}` : ""}${
            sourceFilter ? `&source=${sourceFilter}` : ""
          }`,
        ),
      ]);
      setWatchlists(watchlistData.items);
      setFindings(findingData.items);
      setError("");
    } catch (caught) {
      setError(caught.message);
    }
  }, [statusFilter, sourceFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const runScan = async () => {
    setScanning(true);
    setScanMessage("");
    try {
      const data = await api("/v1/piracy/scan", { method: "POST" });
      const summary = data.summary;
      setScanMessage(
        `Scanned ${summary.scanned} sources — ${summary.newFindings} new, ${summary.updatedFindings} known, ${summary.errors} errors.`,
      );
      await load();
    } catch (caught) {
      setScanMessage(caught.message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Piracy Monitor"
        title="Find and take down leaked courses"
        description="We watch public Telegram channels and YouTube for your course names, collect the links, and draft DMCA notices you can send in one click."
        action={
          <Button onClick={runScan} disabled={scanning}>
            <Radar className="h-4 w-4" /> {scanning ? "Scanning…" : "Scan now"}
          </Button>
        }
      />
      {scanMessage ? (
        <p className="rounded-xl bg-[#eef5df] px-4 py-3 text-xs text-[#465041]">{scanMessage}</p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-[#fdeaea] px-4 py-3 text-xs text-[#a33b3b]" role="alert">
          {error}
        </p>
      ) : null}

      <Surface className="p-5">
        <h2 className="text-sm font-bold uppercase tracking-[.12em] text-[#879080]">Watchlists</h2>
        <p className="mt-1 text-xs text-[#7b8574]">
          Course titles, batch codes, or instructor names to search for — plus the public Telegram
          channels known for sharing leaks.
        </p>
        <div className="mt-4">
          <WatchlistForm onCreated={load} />
        </div>
        <div className="mt-4 grid gap-3">
          {(watchlists || []).map((watchlist) => (
            <WatchlistCard key={watchlist.id} watchlist={watchlist} onChanged={load} />
          ))}
          {watchlists && watchlists.length === 0 ? (
            <p className="text-xs text-[#7b8574]">No watchlists yet — add your first one above.</p>
          ) : null}
        </div>
      </Surface>

      <Surface className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[.12em] text-[#879080]">
              Findings
            </h2>
            <p className="mt-1 text-xs text-[#7b8574]">
              Suspected leaks. Open a takedown case to generate a ready-to-send DMCA notice.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-[#e1e6da] bg-white px-3 py-2 text-xs text-[#263120]"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="false_positive">Dismissed</option>
            </select>
            <select
              aria-label="Filter by source"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
              className="rounded-xl border border-[#e1e6da] bg-white px-3 py-2 text-xs text-[#263120]"
            >
              <option value="">All sources</option>
              <option value="telegram">Telegram</option>
              <option value="youtube">YouTube</option>
              <option value="manual">Manual</option>
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-dashed border-[#dfe5d8] bg-[#fbfcf8] p-4">
          <p className="mb-3 text-xs font-semibold text-[#465041]">
            Found a leak we missed (e.g. on Facebook)? Report it here.
          </p>
          <ReportFindingForm onReported={load} />
        </div>

        <div className="mt-4 grid gap-3">
          {(findings || []).map((finding) => (
            <FindingCard key={finding.id} finding={finding} onChanged={load} />
          ))}
          {findings && findings.length === 0 ? (
            <p className="text-xs text-[#7b8574]">
              No findings{statusFilter || sourceFilter ? " for this filter" : " yet"}.
            </p>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}
