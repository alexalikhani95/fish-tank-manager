import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { isObjectIdOrHexString, type Types } from 'mongoose'
import { User } from '#models/user'
import { TOKEN_COOKIE, verifyToken } from '#services/auth_token'

/**
 * Puts the logged-in User on the request, or answers 401 (ADR-0009).
 *
 * Reads the `token` cookie if there is one, otherwise the `Authorization:
 * Bearer` header (ADR-0006). Only one is ever tried: a bad cookie is a 401
 * even if a good header is also sent.
 */
export default class AuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = await findUser(ctx.request)
    if (!user) {
      return ctx.response.unauthorized({ errors: [{ field: '', message: 'Unauthorized' }] })
    }
    ctx.user = user
    ctx.userId = user._id
    return next()
  }
}

async function findUser(request: HttpContext['request']) {
  // Raw cookie values: the JWT is stored unsigned and unencoded. Presence is the
  // key existing, so an empty `token=` is a 401, not a fall-through to the header.
  const cookies = request.cookiesList()
  const token =
    TOKEN_COOKIE in cookies
      ? cookies[TOKEN_COOKIE]
      : /^Bearer (.+)$/i.exec(request.header('authorization') ?? '')?.[1]
  if (!token) return null

  const claims = await verifyToken(token)
  if (!claims || !isObjectIdOrHexString(claims.sub) || typeof claims.tokenVersion !== 'number') {
    return null
  }

  // A deleted User, or a tokenVersion bumped since the token was signed, is a 401.
  const user = await User.findById(claims.sub)
  if (!user || user.tokenVersion !== claims.tokenVersion) return null
  return user
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    user: InstanceType<typeof User>
    userId: Types.ObjectId
  }
}
