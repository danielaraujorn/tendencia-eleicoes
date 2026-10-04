import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { STATE_COOKIE, STATE_HEADER, stateFromCookie } from "@/lib/labels";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(
    STATE_HEADER,
    stateFromCookie(request.cookies.get(STATE_COOKIE)?.value),
  );
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
