"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Menu, ShieldCheck, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const menu = useRef(null);
  const lastY = useRef(0);
  const auth = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastY.current;

      if (currentY <= 24) {
        setVisible(true);
      } else if (Math.abs(delta) > 4) {
        setVisible(delta < 0);
      }

      lastY.current = currentY;
    };

    lastY.current = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    setVisible(true);
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
    ["About", "/about"],
  ];

  return (
    <header
      className="site-header public-nav"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        transform: visible || open ? "translateY(0)" : "translateY(-110%)",
        transition: "transform 280ms cubic-bezier(.22,.8,.24,1), box-shadow 220ms ease",
        willChange: "transform",
      }}
    >
      <Link href="/" className="wordmark" aria-label="The Unpirator home">
        <span className="brand-symbol">
          <ShieldCheck size={21} />
        </span>
        unpirator<span className="brand-dot">.</span>
      </Link>

      <nav
        ref={menu}
        className={`${
          open ? "!flex" : "!hidden"
        } !absolute left-0 right-0 top-full z-50 !flex-col gap-1 border-t border-[#dfe5d9] bg-[#f8f9f4]/[.98] px-5 py-4 shadow-[0_18px_45px_rgba(24,32,20,.12)] backdrop-blur-xl md:!static md:!flex md:!flex-row md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0`}
        aria-label="Main navigation"
      >
        {links.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className="rounded-xl px-3 py-2.5 md:px-0 md:py-0"
          >
            {label}
          </Link>
        ))}

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#dfe5d9] pt-4 md:!hidden">
          {auth?.account ? (
            <>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#172014] px-4 py-3 text-sm font-semibold text-white"
              >
                Dashboard <ArrowUpRight size={15} />
              </Link>
              <Link
                href="/dashboard/account"
                className="inline-flex items-center justify-center rounded-xl border border-[#ccd5c3] px-4 py-3 text-sm font-semibold text-[#263020]"
              >
                Account
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-[#ccd5c3] px-4 py-3 text-sm font-semibold text-[#263020]"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#172014] px-4 py-3 text-sm font-semibold text-white"
              >
                Get started <ArrowRight size={15} />
              </Link>
            </>
          )}
        </div>
      </nav>

      <div className="header-actions !hidden md:!flex">
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

      <button
        className="nav-toggle !ml-auto md:!hidden"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X /> : <Menu />}
      </button>
    </header>
  );
}
