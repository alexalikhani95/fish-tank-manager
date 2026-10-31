import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Types } from 'mongoose'
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
  const authorization = request.header('authorization')
  const token =
    request.plainCookie(TOKEN_COOKIE, { encoded: false }) ??
    (authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined)
  if (!token) return null

  const claims = await verifyToken(token)
  if (!claims) return null

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
