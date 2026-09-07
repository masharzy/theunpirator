import { NextResponse } from "next/server";
export function proxy(request) {
  const session = request.cookies.get("unpirator_session")?.value;
  const protectedRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/admin");
  const authRoute =
    request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/register";
  if (protectedRoute && !session) return NextResponse.redirect(new URL("/login", request.url));
  if (authRoute && session) return NextResponse.redirect(new URL("/dashboard", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/register"] };
