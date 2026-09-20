import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Map human-readable /@username URLs to /agents/[username].
 * Folders named @[...] are parallel routes in the App Router and cannot host this path.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/@")) {
    const username = pathname.slice(2);
    if (username && !username.includes("/")) {
      const url = request.nextUrl.clone();
      url.pathname = `/agents/${username}`;
      return NextResponse.rewrite(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/@:path*",
};
