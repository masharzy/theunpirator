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
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const focusable = [...(menu.current?.querySelectorAll("a,button") || [])];
    focusable[0]?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [open]);
  const links = [
    ["Product", "/features"],
    ["Pricing", "/pricing"],
    ["Integrations", "/integrations"],
    ["Security", "/security"],
    ["Docs", "/docs"],
    ["Company", "/about"],
  ];
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
        {links.map(([label, href]) => (
          <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
            {label}
          </Link>
        ))}
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
