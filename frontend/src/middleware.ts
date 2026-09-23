import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedRoutes = [
  "/player",
  "/profile",
  "/settings",
  "/sih",
  "/competencies",
  "/skill-gaps",
  "/learning-path",
  "/assessments",
  "/quizzes",
  "/learning-history",
  "/igot",
  "/nssta-training",
  "/ai-assistant",
  "/performance",
  "/admin",
  "/faculty",
  "/professional"
];

const authRoutes = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"];

export function middleware(request: NextRequest) {
  const token =
    request.cookies.get("aarambh_access_token")?.value ||
    request.cookies.get("neurolearn_access_token")?.value;
  const { pathname, searchParams } = request.nextUrl;

  const isProtected = protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  if (isProtected && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "redirect",
      pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "")
    );
    return NextResponse.redirect(loginUrl);
  }

  if (authRoutes.some((route) => pathname.startsWith(route)) && token) {
    return NextResponse.redirect(new URL("/sih/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/player/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/sih/:path*",
    "/competencies/:path*",
    "/skill-gaps/:path*",
    "/learning-path/:path*",
    "/assessments/:path*",
    "/quizzes/:path*",
    "/learning-history/:path*",
    "/igot/:path*",
    "/nssta-training/:path*",
    "/ai-assistant/:path*",
    "/performance/:path*",
    "/admin/:path*",
    "/faculty/:path*",
    "/professional/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email"
  ]
};
