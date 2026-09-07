"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Menu, ShieldCheck, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const menu = useRef(null);
  const auth = useAuth();
  const pathname = usePathname();
  useEffect(() => {
    if (!open) return;
    const focusable = [...(menu.current?.querySelectorAll("a,button") || [])];
    focusable[0]?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab" && focusable.length) {
        const first = focusable[0],
          last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [open]);
  return (
    <header className="site-header public-nav">
      <Link href="/" className="wordmark" aria-label="The Unpirator home">
        <span className="brand-symbol">
          <ShieldCheck size={21} />
        </span>
        unpirator<span className="brand-dot">.</span>
      </Link>
      <button
        className="nav-toggle"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <Menu />}
      </button>
      <nav ref={menu} className={open ? "nav-open" : ""} aria-label="Main navigation">
        <Link href="/#platform">Platform</Link>
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/#integrations">Integrations</Link>
        <Link href="/#plans">Pricing</Link>
        <Link href="/docs" aria-current={pathname === "/docs" ? "page" : undefined}>
          Docs
        </Link>
        <Link href="/#security">Security</Link>
      </nav>
      <div className="header-actions">
        {auth?.account ? (
          <>
            <Link href="/dashboard" className="login-link">
              Dashboard <ArrowUpRight size={14} />
            </Link>
            <Link
              href="/dashboard/account"
              className="account-avatar"
              aria-label={`Account settings for ${auth.account.email}`}
            >
              {auth.account.email.slice(0, 1).toUpperCase()}
            </Link>
          {auth.account.platformRole && (
              <Link href="/admin" className="small-cta">
                Admin Console <ArrowRight size={15} />
              </Link>
            )}
          </>
        ) : (
          <>
            <Link href="/login" className="login-link">
              Sign in <ArrowUpRight size={14} />
            </Link>
            <Link href="/register" className="small-cta">
              Get started <ArrowRight size={15} />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
