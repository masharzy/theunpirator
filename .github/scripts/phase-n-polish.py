from pathlib import Path


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found != count:
        raise SystemExit(f"{path}: expected {count} match(es), found {found}: {old[:100]!r}")
    p.write_text(text.replace(old, new, count))


# Shared console accessibility primitives.
path = "apps/dashboard/components/console-kit.jsx"
replace(
    path,
    'import Link from "next/link";\nimport { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";\n',
    'import Link from "next/link";\nimport { useEffect, useRef } from "react";\nimport { ArrowRight, CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";\n',
)
replace(
    path,
    'export function PageHeader({ eyebrow, title, description, action }) {',
    '''export function useModalA11y(open, onClose) {
  const dialogRef = useRef(null);
  const lastActiveRef = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousOverflow = document.body.style.overflow;
    lastActiveRef.current = document.activeElement;
    document.body.style.overflow = "hidden";

    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'summary',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const focusFirst = () => {
      const first = dialog.querySelector(focusableSelector);
      (first || dialog).focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(focusFirst);

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll(focusableSelector)].filter(
        (element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0,
      );
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const previous = lastActiveRef.current;
      if (previous && typeof previous.focus === "function") {
        window.requestAnimationFrame(() => previous.focus({ preventScroll: true }));
      }
    };
  }, [open]);

  return dialogRef;
}

export function PageHeader({ eyebrow, title, description, action }) {''',
)
replace(
    path,
    '''      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf0e8]">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: finite ? `${pct}%` : "0%" }}
        />
      </div>''',
    '''      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf0e8]"
        role={finite ? "progressbar" : undefined}
        aria-label={finite ? label : undefined}
        aria-valuemin={finite ? 0 : undefined}
        aria-valuemax={finite ? numericLimit : undefined}
        aria-valuenow={finite ? Math.min(numericUsed, numericLimit) : undefined}
        aria-valuetext={
          finite ? `${format(numericUsed)} used of ${format(numericLimit)}` : undefined
        }
      >
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: finite ? `${pct}%` : "0%" }}
        />
      </div>''',
)
replace(
    path,
    'className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#172014] px-4 py-2.5 text-sm font-semibold text-white"',
    'className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#172014] px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8fa868] focus-visible:ring-offset-2"',
)
replace(
    path,
    'export function ChecklistItem({ done, children }) {',
    '''export function LoadingPanel({ label = "Loading workspace data…" }) {
  return (
    <Surface className="p-6" aria-busy="true">
      <div role="status" aria-live="polite" className="space-y-3">
        <span className="sr-only">{label}</span>
        <div className="h-4 w-40 animate-pulse rounded bg-[#e9ede4]" />
        <div className="h-3 w-full max-w-xl animate-pulse rounded bg-[#f0f3ec]" />
        <div className="h-3 w-2/3 max-w-md animate-pulse rounded bg-[#f0f3ec]" />
      </div>
    </Surface>
  );
}

export function ErrorPanel({ message, onRetry }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
        >
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}

export function ChecklistItem({ done, children }) {''',
)

# Dashboard shell: keyboard-safe mobile navigation, active semantics, skip link.
path = "apps/dashboard/components/dashboard-shell.jsx"
replace(
    path,
    'import { Button } from "@/components/ui/button";\nimport { useAuth } from "@/components/auth-provider";\n',
    'import { Button } from "@/components/ui/button";\nimport { useModalA11y } from "@/components/console-kit";\nimport { useAuth } from "@/components/auth-provider";\n',
)
replace(
    path,
    '  const [usage, setUsage] = useState(null);\n',
    '  const [usage, setUsage] = useState(null);\n  const mobileNavRef = useModalA11y(menuOpen, () => setMenuOpen(false));\n',
)
replace(
    path,
    '''                  <Link
                    key={href}
                    href={href}
                    prefetch={false}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-[#172014] font-semibold text-white shadow-sm" : "text-[#5d6857] hover:bg-[#f1f4eb] hover:text-[#1f291c]"}`}
                  >''',
    '''                  <Link
                    key={href}
                    href={href}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9aae7a] focus-visible:ring-offset-2 ${active ? "bg-[#172014] font-semibold text-white shadow-sm" : "text-[#5d6857] hover:bg-[#f1f4eb] hover:text-[#1f291c]"}`}
                  >''',
)
replace(
    path,
    '    <div className="min-h-screen bg-[#f2f4ed] lg:grid lg:grid-cols-[270px_1fr]">\n',
    '''    <div className="min-h-screen bg-[#f2f4ed] lg:grid lg:grid-cols-[270px_1fr]">
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-[#172014] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to dashboard content
      </a>
''',
)
replace(
    path,
    '          <aside className="relative h-full w-[86%] max-w-[320px] overflow-y-auto bg-white p-5 shadow-2xl">',
    '''          <aside
            id="mobile-dashboard-navigation"
            ref={mobileNavRef}
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            tabIndex={-1}
            className="relative h-full w-[86%] max-w-[320px] overflow-y-auto bg-white p-5 shadow-2xl outline-none"
          >''',
)
replace(
    path,
    '''          <button
            aria-label="Open navigation"
            className="rounded-xl border border-[#dce2d4] bg-white p-2 lg:hidden"
            onClick={() => setMenuOpen(true)}
          >''',
    '''          <button
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            aria-controls="mobile-dashboard-navigation"
            className="cursor-pointer rounded-xl border border-[#dce2d4] bg-white p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9aae7a] focus-visible:ring-offset-2 lg:hidden"
            onClick={() => setMenuOpen(true)}
          >''',
)
replace(
    path,
    '        <main className="p-4 md:p-8 lg:p-10">',
    '        <main id="dashboard-main" tabIndex={-1} className="p-4 outline-none md:p-8 lg:p-10">',
)

# Shared button/input focus and pointer states.
Path("apps/dashboard/components/ui/button.jsx").write_text('''import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        outline: "border border-border bg-background hover:bg-muted",
        ghost: "hover:bg-muted",
        destructive: "bg-destructive text-white hover:opacity-90",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
''')

Path("apps/dashboard/components/ui/input.jsx").write_text('''import { cn } from "@/lib/utils";

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-[#9aaa84] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
''')

# Customer-facing generic records: hide raw identifiers, mobile cards, retry/loading states.
Path("apps/dashboard/components/customer-records-page.jsx").write_text('''"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  EmptyState,
  ErrorPanel,
  LoadingPanel,
  PageHeader,
  Surface,
} from "@/components/console-kit";

const hiddenKeys = new Set([
  "tenantId",
  "metadata",
  "encryptedSecret",
  "secretHash",
  "externalUserId",
  "providerReference",
]);

const humanize = (value) =>
  String(value)
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());

const customerFacingKey = (key) =>
  !hiddenKeys.has(key) && key !== "id" && !key.endsWith("Id") && !key.endsWith("_id");

const display = (value) => {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ") || "—";
  if (typeof value === "object") {
    const safe = Object.entries(value)
      .filter(([, nested]) => ["string", "number", "boolean"].includes(typeof nested))
      .slice(0, 4);
    return safe.length
      ? safe.map(([key, nested]) => `${humanize(key)}: ${String(nested)}`).join(" · ")
      : "Structured details";
  }
  if (String(value).match(/^\\d{4}-\\d{2}-\\d{2}T/)) return new Date(value).toLocaleString();
  return String(value);
};

const priorities = [
  "viewerEmail",
  "email",
  "name",
  "title",
  "action",
  "status",
  "role",
  "resource",
  "target",
  "createdAt",
  "updatedAt",
  "lastSeenAt",
];

export function CustomerRecordsPage({ eyebrow, title, description, endpoint, empty }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api(endpoint)
      .then((response) => {
        if (active) setItems(response.items || []);
      })
      .catch((failure) => {
        if (active) setError(failure.message || `Unable to load ${title.toLowerCase()}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint, reloadKey, title]);

  const columns = useMemo(() => {
    if (!items?.[0]) return [];
    const keys = Object.keys(items[0]).filter(customerFacingKey);
    return [
      ...priorities.filter((key) => keys.includes(key)),
      ...keys.filter((key) => !priorities.includes(key)),
    ].slice(0, 7);
  }, [items]);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <ErrorPanel message={error} onRetry={() => setReloadKey((value) => value + 1)} />

      {loading && items === null ? (
        <LoadingPanel label={`Loading ${title.toLowerCase()}…`} />
      ) : items === null ? null : items.length === 0 ? (
        <EmptyState title={empty} description="New activity will appear here automatically." />
      ) : columns.length === 0 ? (
        <EmptyState
          title="No customer-facing details to show"
          description="Technical identifiers are intentionally kept out of this view."
        />
      ) : (
        <Surface className="overflow-hidden">
          <div className="divide-y divide-[#e7eadf] md:hidden">
            {items.map((item, index) => (
              <article className="p-5" key={item.id || index}>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {columns.map((column) => (
                    <div key={column} className="min-w-0">
                      <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8b9584]">
                        {humanize(column)}
                      </dt>
                      <dd className="mt-1 break-words text-sm text-[#465240]">
                        {display(item[column])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">{title} records</caption>
              <thead className="bg-[#f3f6ed] text-[10px] uppercase tracking-[.12em] text-[#73806b]">
                <tr>
                  {columns.map((column) => (
                    <th scope="col" className="px-5 py-4" key={column}>
                      {humanize(column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr className="border-t border-[#e7eadf]" key={item.id || index}>
                    {columns.map((column) => (
                      <td className="max-w-72 break-words px-5 py-4 text-xs text-[#465240]" key={column}>
                        {display(item[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      )}
    </div>
  );
}
''')

# Generic data page gets the same safe display/retry/responsive treatment.
Path("apps/dashboard/components/data-page.jsx").write_text('''"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  EmptyState,
  ErrorPanel,
  LoadingPanel,
  PageHeader,
  Surface,
} from "@/components/console-kit";

function label(value) {
  return String(value)
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

const hidden = (key) =>
  ["tenantId", "metadata", "encryptedSecret", "secretHash", "providerReference"].includes(key) ||
  key === "id" ||
  key.endsWith("Id") ||
  key.endsWith("_id");

function value(input) {
  if (input == null || input === "") return "—";
  if (typeof input === "boolean") return input ? "Enabled" : "Disabled";
  if (Array.isArray(input)) return input.map((item) => String(item)).join(", ") || "—";
  if (typeof input === "object") {
    const safe = Object.entries(input)
      .filter(([key, nested]) => !hidden(key) && ["string", "number", "boolean"].includes(typeof nested))
      .slice(0, 6);
    return safe.length
      ? safe.map(([key, nested]) => `${label(key)}: ${String(nested)}`).join(" · ")
      : "Structured details";
  }
  if (String(input).match(/^\\d{4}-\\d{2}-\\d{2}T/)) return new Date(input).toLocaleString();
  return String(input);
}

export function DataPage({ title, description, endpoint, render }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api(endpoint)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((failure) => {
        if (active) setError(failure.message || `Unable to load ${title.toLowerCase()}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint, reloadKey, title]);

  const items = data?.items;
  const columns = useMemo(() => {
    if (!items?.[0]) return [];
    return Object.keys(items[0]).filter((key) => !hidden(key)).slice(0, 7);
  }, [items]);

  return (
    <div className="space-y-8">
      <PageHeader title={title} description={description} />
      <ErrorPanel message={error} onRetry={() => setReloadKey((current) => current + 1)} />

      {loading && data === null ? (
        <LoadingPanel label={`Loading ${title.toLowerCase()}…`} />
      ) : data === null ? null : render ? (
        render(data)
      ) : Array.isArray(items) ? (
        items.length ? (
          <Surface className="overflow-hidden">
            <div className="divide-y divide-[#e7eadf] md:hidden">
              {items.map((row, index) => (
                <article className="p-5" key={row.id || index}>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {columns.map((column) => (
                      <div key={column}>
                        <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8b9584]">
                          {label(column)}
                        </dt>
                        <dd className="mt-1 break-words text-sm text-[#465240]">{value(row[column])}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">{title} details</caption>
                <thead className="bg-[#f3f6ed] text-[10px] uppercase tracking-[.12em] text-[#73806b]">
                  <tr>
                    {columns.map((column) => (
                      <th scope="col" className="px-5 py-4" key={column}>{label(column)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, index) => (
                    <tr className="border-t border-[#e7eadf]" key={row.id || index}>
                      {columns.map((column) => (
                        <td className="max-w-72 break-words px-5 py-4 text-xs text-[#465240]" key={column}>
                          {value(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>
        ) : (
          <EmptyState title={`No ${title.toLowerCase()} yet`} description="Activity will appear here automatically." />
        )
      ) : (
        <Surface className="p-5 sm:p-6">
          <dl className="grid gap-4 sm:grid-cols-2">
            {Object.entries(data)
              .filter(([key]) => !hidden(key))
              .map(([key, nested]) => (
                <div key={key} className="rounded-xl border border-[#e4e8dc] p-4">
                  <dt className="text-xs text-[#7b8574]">{label(key)}</dt>
                  <dd className="mt-2 break-words text-sm font-medium text-[#33402d]">{value(nested)}</dd>
                </div>
              ))}
          </dl>
        </Surface>
      )}
    </div>
  );
}
''')

# Session list: raw IDs only in the technical disclosure.
path = "apps/dashboard/app/dashboard/sessions/page.js"
replace(
    path,
    '''                          <p
                            className="mt-1 font-mono text-[10px] text-[#929b8b]"
                            title={session.id}
                          >
                            Session {shortId(session.id)}
                          </p>
''',
    '',
)
replace(
    path,
    '''                        <p className="truncate text-sm font-semibold text-[#35432f]">
                          Asset {shortId(session.assetId)}
                        </p>''',
    '''                        <p className="truncate text-sm font-semibold text-[#35432f]">
                          Content unavailable
                        </p>''',
)
replace(
    path,
    '''                    <div className="grid gap-3 border-t border-[#edf0e9] px-3.5 py-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-[#929b8b]">Started</p>''',
    '''                    <div className="grid gap-3 border-t border-[#edf0e9] px-3.5 py-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-[#929b8b]">Session ID</p>
                        <p className="mt-1 break-all font-mono text-[10px] text-[#46513f]">
                          {session.id}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#929b8b]">Started</p>''',
)

# Viewers drawer: focus trap/restore and no raw viewer ID in the main list.
path = "apps/dashboard/app/dashboard/viewers/page.js"
replace(
    path,
    'import { EmptyState, PageHeader, Surface } from "@/components/console-kit";',
    'import { EmptyState, PageHeader, Surface, useModalA11y } from "@/components/console-kit";',
)
replace(
    path,
    '''  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
''',
    '''  const [confirmReset, setConfirmReset] = useState(false);
  const drawerRef = useModalA11y(true, onClose);
''',
)
replace(
    path,
    '''      <aside
        className="ml-auto h-full w-full max-w-2xl overflow-y-auto border-l border-[#dfe4d6] bg-[#f7f8f3] shadow-[-24px_0_70px_rgba(23,32,20,.16)]"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="Viewer details"
      >''',
    '''      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="ml-auto h-full w-full max-w-2xl overflow-y-auto border-l border-[#dfe4d6] bg-[#f7f8f3] shadow-[-24px_0_70px_rgba(23,32,20,.16)] outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="Viewer details"
      >''',
)
replace(
    path,
    '''                      <span className="font-mono text-[10px] text-[#a0a89a] md:hidden">
                        {shortId(viewer.id)}
                      </span>
''',
    '',
)

# Security drawer: replace manual Escape/body-lock behavior with shared modal behavior.
path = "apps/dashboard/app/dashboard/security/page.js"
replace(
    path,
    'import { EmptyState, PageHeader, Stat, StatusPill, Surface } from "@/components/console-kit";',
    'import { EmptyState, PageHeader, Stat, StatusPill, Surface, useModalA11y } from "@/components/console-kit";',
)
replace(
    path,
    '''  const [detail, setDetail] = useState(selectedEvent ? { event: selectedEvent } : null);
  const [partial, setPartial] = useState(false);
''',
    '''  const [detail, setDetail] = useState(selectedEvent ? { event: selectedEvent } : null);
  const [partial, setPartial] = useState(false);
  const drawerRef = useModalA11y(Boolean(eventId), onClose);
''',
)
replace(
    path,
    '''  useEffect(() => {
    if (!eventId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [eventId, onClose]);

''',
    '',
)
replace(
    path,
    '<aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-[#dde2d8] bg-[#f7f8f4] shadow-2xl">',
    '<aside ref={drawerRef} tabIndex={-1} className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-[#dde2d8] bg-[#f7f8f4] shadow-2xl outline-none">',
)

# Logs drawer: shared focus trap/restore plus visible keyboard focus on rows.
path = "apps/dashboard/app/dashboard/logs/page.js"
replace(
    path,
    'import { EmptyState, PageHeader, Surface } from "@/components/console-kit";',
    'import { EmptyState, PageHeader, Surface, useModalA11y } from "@/components/console-kit";',
)
replace(
    path,
    '  const [error, setError] = useState("");\n',
    '  const [error, setError] = useState("");\n  const drawerRef = useModalA11y(Boolean(selected), () => setSelected(null));\n',
)
replace(
    path,
    '''  useEffect(() => {
    if (!selected) return undefined;
    const close = (event) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);

''',
    '',
)
replace(
    path,
    'className="grid w-full gap-4 px-5 py-5 text-left transition hover:bg-[#fafbf8] md:grid-cols-[minmax(0,1fr)_180px_180px] md:items-center"',
    'className="grid w-full cursor-pointer gap-4 px-5 py-5 text-left transition hover:bg-[#fafbf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8fa868] md:grid-cols-[minmax(0,1fr)_180px_180px] md:items-center"',
)
replace(
    path,
    '''          <aside
            className="h-full w-full max-w-xl overflow-y-auto bg-[#fbfcf8] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Log event details"
          >''',
    '''          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className="h-full w-full max-w-xl overflow-y-auto bg-[#fbfcf8] shadow-2xl outline-none"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Log event details"
          >''',
)

# Audit drawer gets the same focus/restore semantics.
path = "apps/dashboard/app/dashboard/audit/page.js"
replace(
    path,
    'import { EmptyState, PageHeader, Surface } from "@/components/console-kit";',
    'import { EmptyState, PageHeader, Surface, useModalA11y } from "@/components/console-kit";',
)
replace(
    path,
    '  const [error, setError] = useState("");\n',
    '  const [error, setError] = useState("");\n  const drawerRef = useModalA11y(Boolean(selected), () => setSelected(null));\n',
)
replace(
    path,
    '''  useEffect(() => {
    if (!selected) return undefined;
    const close = (event) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);

''',
    '',
)
replace(
    path,
    '''          <aside
            className="h-full w-full max-w-xl overflow-y-auto bg-[#fbfcf8] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Audit entry details"
          >''',
    '''          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className="h-full w-full max-w-xl overflow-y-auto bg-[#fbfcf8] shadow-2xl outline-none"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Audit entry details"
          >''',
)
