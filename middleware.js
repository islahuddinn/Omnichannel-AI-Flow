// middleware.js
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
// Security headers applied inline (Edge runtime — no external imports from src/)
function applySecurityHeaders(response) {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob: https://*.amazonaws.com; connect-src 'self' wss: ws: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()');
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
}

const JWT_SECRET = process.env.JWT_SECRET;

// Public routes that don't require authentication
const publicRoutes = [
  "/auth/login",
  "/auth/logout",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-otp",
  "/setup",
  "/webchat",
  "/_next",
  "/favicon.ico",
];

// API routes that don't require authentication
const publicApiRoutes = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify",
  "/api/auth/verify-otp",
  "/api/deals/bulk-upsert",
  "/api/contact/create-auto",
  "/api/health",
  "/api/webhooks",
  "/api/webchat",
  "/api/setup",
  "/api/tracking",
  "/api/call-logs/create-log",
];

// Role-based route access patterns (using regex for proper matching)
const roleRoutes = {
  super_admin: [
    /^\/dashboard(\/|$)/,
    /^\/companies(\/|$)/,
    /^\/users(\/|$)/,
    /^\/settings(\/|$)/,
    /^\/profile(\/|$)/,
  ],
  company_admin: [
    /^\/c\/dashboard(\/|$)/,
    /^\/c\/conversations(\/|$)/,
    /^\/c\/contacts(\/|$)/,
    /^\/c\/channels(\/|$)/,
    /^\/c\/users(\/|$)/,
    /^\/c\/analytics(\/|$)/,
    /^\/c\/settings(\/|$)/,
    /^\/c\/profile(\/|$)/,
    /^\/c\/departments(\/|$)/,
    /^\/c\/deals(\/|$)/,
    /^\/c\/admin(\/|$)/,
    /^\/c\/automation(\/|$)/, // ✅ Added automation route
    /^\/c\/call-center(\/|$)/,
  ],
  agent: [
    /^\/c\/dashboard(\/|$)/,
    /^\/c\/conversations(\/|$)/,
    /^\/c\/contacts(\/|$)/,
    /^\/c\/deals(\/|$)/,
    /^\/c\/channels(\/|$)/,
    /^\/c\/profile(\/|$)/,
    /^\/c\/call-center\/history(\/|$)/,
  ],
};

// Get user from token
async function getUserFromToken(request) {
  try {
    if (!JWT_SECRET) {
      console.error("[Middleware] JWT_SECRET is not defined");
      return null;
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return null;
    }

    try {
      // Use jose library for Edge runtime compatibility
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      return payload;
    } catch (jwtError) {
      // Token is invalid or expired
      // Token invalid or expired - silent for normal flow
      return null;
    }
  } catch (error) {
    console.error("[Middleware] Error getting user from token:", error?.message || error);
    return null;
  }
}

// Attempt to refresh token using the refresh endpoint
async function attemptTokenRefresh(request) {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("refreshToken")?.value;

    if (!refreshToken) {
      return null;
    }

    // Call the internal refresh endpoint
    const refreshUrl = new URL("/api/auth/refresh", request.url);
    const refreshResponse = await fetch(refreshUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `refreshToken=${refreshToken}`,
      },
    });

    if (!refreshResponse.ok) {
      // Token refresh failed - silent for normal flow
      return null;
    }

    const data = await refreshResponse.json();
    if (!data.success || !data.data?.accessToken) {
      return null;
    }

    // Verify the new token to get user payload
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(data.data.accessToken, secret);

    // Return the user payload and the refresh response (to forward cookies)
    return { user: payload, refreshResponse };
  } catch (error) {
    console.error("[Middleware] Token refresh error:", error?.message || error);
    return null;
  }
}

// Check if route is public
function isPublicRoute(pathname) {
  // ✅ Exact match first for better performance
  if (publicRoutes.includes(pathname)) {
    return true;
  }
  // ✅ Then check if pathname starts with any public route + "/"
  return publicRoutes.some(
    (route) => pathname.startsWith(route + "/")
  );
}

// Check if API route is public
function isPublicApiRoute(pathname) {
  return publicApiRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

// Check if user has access to route
function hasRouteAccess(user, pathname) {
  if (!user || !user.role) return false;

  const role = user.role;

  // Super admin has access to all routes except company admin routes
  if (role === "super_admin") {
    // Super admin should not access company admin routes
    if (pathname.startsWith("/c/")) {
      return false;
    }
    // Allow all super admin routes
    const allowedRoutes = roleRoutes[role] || [];
    return allowedRoutes.some((pattern) => pattern.test(pathname));
  }

  // Check role-specific routes using regex patterns
  const allowedRoutes = roleRoutes[role] || [];
  return allowedRoutes.some((pattern) => pattern.test(pathname));
}

// Get default redirect path for role
function getDefaultPath(role) {
  switch (role) {
    case "super_admin":
      return "/dashboard";
    case "company_admin":
      return "/c/dashboard";
    case "agent":
      return "/c/dashboard";
    default:
      return "/auth/login";
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/sounds/") || // ✅ Allow all files in /sounds/ directory
    pathname.match(
      /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot|mp3|wav|ogg|webm|m4a|aac)$/i
    ) // ✅ Added audio file extensions
  ) {
    return NextResponse.next();
  }

  // Handle API routes
  if (pathname.startsWith("/api")) {
    // Mobile API routes use Bearer token auth handled at route level (verifyMobileAuth)
    // Bypass global cookie-based middleware for all mobile routes
    if (pathname.startsWith("/api/mobile")) {
      return NextResponse.next();
    }

    // Allow public API routes
    if (isPublicApiRoute(pathname)) {
      return NextResponse.next();
    }

    // Verify authentication for protected API routes
    let apiUser = await getUserFromToken(request);

    // If access token expired, try refreshing before returning 401
    if (!apiUser) {
      const refreshResult = await attemptTokenRefresh(request);
      if (refreshResult) {
        apiUser = refreshResult.user;

        // Forward the new cookies from refresh response
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-user-id", apiUser.userId || "");
        requestHeaders.set("x-user-role", apiUser.role || "");
        requestHeaders.set("x-company-id", apiUser.companyId || "");

        const response = NextResponse.next({
          request: { headers: requestHeaders },
        });

        // Copy Set-Cookie headers from refresh response
        const setCookieHeaders = refreshResult.refreshResponse.headers.getSetCookie?.()
          || refreshResult.refreshResponse.headers.get("set-cookie")?.split(", ")
          || [];
        for (const cookie of setCookieHeaders) {
          response.headers.append("Set-Cookie", cookie);
        }

        return response;
      }

      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    // Pass user info to route handlers via headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", apiUser.userId || "");
    requestHeaders.set("x-user-role", apiUser.role || "");
    requestHeaders.set("x-company-id", apiUser.companyId || "");

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Allow public routes
  if (isPublicRoute(pathname)) {
    // ✅ Allow forgot-password, reset-password, and verify-otp for both logged in and logged out users
    if (pathname === "/auth/forgot-password" || pathname === "/auth/reset-password" || pathname === "/auth/verify-otp") {
      return NextResponse.next();
    }
    
    // If user is already logged in and trying to access login page, redirect to dashboard
    const user = await getUserFromToken(request);
    if (user && pathname.startsWith("/auth/login")) {
      const defaultPath = getDefaultPath(user.role);
      return NextResponse.redirect(new URL(defaultPath, request.url));
    }
    return NextResponse.next();
  }

  // Handle root path
  if (pathname === "/") {
    const user = await getUserFromToken(request);
    if (user) {
      // Redirect authenticated users to their dashboard
      const defaultPath = getDefaultPath(user.role);
      return NextResponse.redirect(new URL(defaultPath, request.url));
    } else {
      // Redirect unauthenticated users to login
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
  }

  // Get user from token
  let user = await getUserFromToken(request);
  let refreshedCookies = null;

  // If access token expired, try refreshing before redirecting to login
  if (!user) {
    const refreshResult = await attemptTokenRefresh(request);
    if (refreshResult) {
      user = refreshResult.user;

      // Collect Set-Cookie headers from refresh response to forward later
      refreshedCookies = refreshResult.refreshResponse.headers.getSetCookie?.()
        || refreshResult.refreshResponse.headers.get("set-cookie")?.split(", ")
        || [];
    }
  }

  // If user is still not authenticated after refresh attempt, redirect to login
  if (!user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If user is authenticated and trying to access login/auth pages, redirect to their dashboard
  // Exception: Allow forgot-password and reset-password even when logged in
  if (pathname.startsWith("/auth/")) {
    // Allow forgot-password and reset-password routes even when authenticated
    if (pathname === "/auth/forgot-password" || pathname === "/auth/reset-password" || pathname === "/auth/verify-otp") {
      return NextResponse.next();
    }
    // Redirect other auth pages (like login) to dashboard
    const defaultPath = getDefaultPath(user.role);
    return NextResponse.redirect(new URL(defaultPath, request.url));
  }

  // Check route access based on role
  if (!hasRouteAccess(user, pathname)) {
    // User doesn't have access to this route, redirect to their dashboard
    const defaultPath = getDefaultPath(user.role);
    return NextResponse.redirect(new URL(defaultPath, request.url));
  }

  // Build the response and forward refreshed cookies if token was refreshed
  const response = NextResponse.next();

  // Apply OWASP security headers
  applySecurityHeaders(response);

  if (refreshedCookies) {
    for (const cookie of refreshedCookies) {
      response.headers.append("Set-Cookie", cookie);
    }
  }

  return response;
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|sounds/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot|mp3|wav|ogg|webm|m4a|aac)$).*)",
  ],
};
