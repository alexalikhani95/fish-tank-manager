import type { ApiResponse } from '@japa/api-client'
import type { SignJWT } from 'jose'
import env from '#start/env'

/** The `token` Set-Cookie line, if the response set one. */
export function tokenSetCookie(response: ApiResponse): string | undefined {
  const setCookie: string[] = [response.headers()['set-cookie'] ?? []].flat()
  return setCookie.find((line) => line.startsWith('token='))
}

/**
 * `token=<jwt>`, ready to send back as a raw `cookie` header. Japa's cookie
 * helpers sign or encode values, which a bare JWT must not be.
 */
export function tokenCookie(response: ApiResponse): string {
  const line = tokenSetCookie(response)
  if (!line) throw new Error('response set no token cookie')
  return line.split(';')[0]
}

export function jwtOf(response: ApiResponse): string {
  return tokenCookie(response).slice('token='.length)
}

/** The only tokens tests build themselves: signed with the test JWT_SECRET. */
export function signWithTestSecret(jwt: SignJWT): Promise<string> {
  return jwt
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(env.get('JWT_SECRET')))
}

/** The exact 401 body, pinned as a literal so a change to the contract is deliberate. */
export const unauthorized = { errors: [{ field: '', message: 'Unauthorized' }] }
