import { NextResponse } from "next/server";

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

export async function proxy(request) {
  const pathname = request.nextUrl.pathname;
  const dashboardRoute = pathname.startsWith("/dashboard");
  const authRoute = pathname === "/login" || pathname === "/register";
  if (!dashboardRoute && !authRoute) return NextResponse.next();

  const session = await getSession(request);

  if (dashboardRoute && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (authRoute && session) {
    return NextResponse.redirect(
      new URL(session?.account?.platformRole ? "/admin" : "/dashboard", request.url),
    );
  }

  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/login", "/register"] };
