import type { HttpContext } from '@adonisjs/core/http'
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import env from '#start/env'

/**
 * The login token (ADR-0006, ADR-0009): an HS256 JWT with the User id as
 * subject and the User's tokenVersion as a claim, valid for a fixed 30 days.
 */
export const TOKEN_COOKIE = 'token'

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60
const secret = new TextEncoder().encode(env.get('JWT_SECRET'))

/**
 * Signs a token for the User and sets it as the `token` cookie.
 *
 * Every attribute is set here, not taken from config/app.ts (whose defaults
 * are 2 hours and `secure` in production only). The value is the bare JWT —
 * `encode: false` — because the JWT is already signed.
 */
export async function setTokenCookie(
  response: HttpContext['response'],
  user: { id: string; tokenVersion: number }
) {
  const token = await new SignJWT({ tokenVersion: user.tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setExpirationTime(Math.floor(Date.now() / 1000) + THIRTY_DAYS_IN_SECONDS)
    .sign(secret)

  response.plainCookie(TOKEN_COOKIE, token, {
    encode: false,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS_IN_SECONDS,
    domain: '',
  })
}

/** The token's claims, or null when the signature, expiry or subject is bad or missing. */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      requiredClaims: ['exp', 'sub'],
    })
    return payload
  } catch {
    return null
  }
}
