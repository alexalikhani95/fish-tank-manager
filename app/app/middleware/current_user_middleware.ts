import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { Types } from 'mongoose'
import env from '#start/env'

/**
 * Puts the owning User's id on the request.
 *
 * ponytail: stub until the JWT guard lands (ADR-0003/0006). It reads a fixed id
 * from DEV_USER_ID instead of a token. When the guard arrives, this file becomes
 * `ctx.userId = ctx.auth.user!.id` and nothing else changes — every query below
 * already filters on ctx.userId, which is the part that must not be retrofitted.
 * The `ctx.userId` type lives in auth_middleware.ts.
 */
const devUserId = new Types.ObjectId(env.get('DEV_USER_ID'))

export default class CurrentUserMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    ctx.userId = devUserId
    return next()
  }
}
