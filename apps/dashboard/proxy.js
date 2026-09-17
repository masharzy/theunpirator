import { NextResponse } from "next/server";

const ADMIN_ROLES = new Set([
  "super_admin",
  "operations_admin",
  "billing_admin",
  "support_admin",
  "security_admin",
  "auditor",
]);

function authMeUrl(request) {
  const origin = process.env.CONTROL_API_ORIGIN || process.env.NEXT_PUBLIC_API_URL;
  if (origin) return `${origin.replace(/\/$/, "")}/v1/auth/me`;
  return new URL("/control-api/v1/auth/me", request.url).toString();
}

async function getSession(request) {
  const session = request.cookies.get("unpirator_session")?.value;
  if (!session) return null;
  try {
    const response = await fetch(authMeUrl(request), {
      headers: { cookie: request.headers.get("cookie") || "" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function concealedNotFound(request) {
  const response = NextResponse.rewrite(new URL("/not-found", request.url), { status: 404 });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

export async function proxy(request) {
  const pathname = request.nextUrl.pathname;
  const dashboardRoute = pathname.startsWith("/dashboard");
  const adminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const authRoute = pathname === "/login" || pathname === "/register";

  if (!dashboardRoute && !adminRoute && !authRoute) return NextResponse.next();

  // Admin is fail-closed at the edge/server boundary. The browser receives only
  // the 404 route unless a real server-validated session has an allowed admin role.
  if (adminRoute) {
    const session = await getSession(request);
    const role = session?.account?.platformRole;
    if (!role || !ADMIN_ROLES.has(role)) return concealedNotFound(request);
    return NextResponse.next();
  }

  const session = await getSession(request);

  if (dashboardRoute && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (authRoute && session) {
    const role = session?.account?.platformRole;
    return NextResponse.redirect(
      new URL(role && ADMIN_ROLES.has(role) ? "/admin" : "/dashboard", request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/register"],
};
