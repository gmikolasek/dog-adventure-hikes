import { NextRequest, NextResponse } from 'next/server'

const publicRoutes = [
  '/',
  '/login',
  '/onboarding',
]

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isPublic =
    publicRoutes.includes(pathname) ||
    pathname.startsWith('/onboarding/')

  if (isPublic) return NextResponse.next()

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)'],
}
