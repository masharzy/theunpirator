import { NextResponse } from "next/server";
export function proxy(request) {
  const session = request.cookies.get("unpirator_session")?.value;
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] };
