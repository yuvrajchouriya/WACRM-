import { NextResponse, type NextRequest } from 'next/server'

/**
 * Lightweight middleware — NO Supabase client, NO network calls.
 *
 * The previous approach used `createServerClient` + `getSession()` which
 * despite being "local" still initialised the full Supabase SSR client on
 * every request. On Vercel Edge Runtime this initialisation alone was enough
 * to exceed the middleware time budget → MIDDLEWARE_INVOCATION_TIMEOUT 504.
 *
 * Fix: read the Supabase session cookie directly. The cookie name is always
 * `sb-<project-ref>-auth-token`. If it exists and is non-empty the user has
 * an active session — no JWT validation needed here because protected API
 * routes validate via `supabase.auth.getUser()` on the server side anyway.
 */

const SUPABASE_PROJECT_REF = 'kweswizucllliezoratq'
const SESSION_COOKIE = `sb-${SUPABASE_PROJECT_REF}-auth-token`

function hasSession(request: NextRequest): boolean {
  // The cookie is a JSON array when using @supabase/ssr. Any non-empty value
  // means a session exists. We intentionally do NOT validate the JWT here —
  // that would require a network call. Server-side handlers do full validation.
  const cookie = request.cookies.get(SESSION_COOKIE)
  return !!cookie?.value
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  const isLoggedIn = hasSession(request)

  // ── Auth pages ────────────────────────────────────────────────────────────
  // Redirect already-authenticated users away from login/signup.
  // Exception: preserve invite-token redirects.
  if (isLoggedIn && (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = searchParams.get('invite')
    if (inviteToken && (pathname === '/login' || pathname === '/signup')) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = '/dashboard'
      url.search = ''
    }
    return NextResponse.redirect(url)
  }

  // ── Protected pages ───────────────────────────────────────────────────────
  const protectedPaths = [
    '/dashboard',
    '/inbox',
    '/contacts',
    '/pipelines',
    '/broadcasts',
    '/automations',
    '/settings',
    '/flows',
  ]
  if (!isLoggedIn && protectedPaths.some(p => pathname.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // ── Protected API routes (not webhooks) ───────────────────────────────────
  if (
    !isLoggedIn &&
    pathname.startsWith('/api/whatsapp/') &&
    !pathname.includes('/webhook')
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
