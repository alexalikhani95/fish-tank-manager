import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { isObjectIdOrHexString } from 'mongoose'
import { Tank } from '#models/tank'

type TankDocument = NonNullable<Awaited<ReturnType<typeof Tank.findOne>>>

/**
 * Loads the caller's Tank for every `tanks/:tankId` route, after `auth`, or
 * answers 404 — malformed, missing and foreign ids alike, so the caller never
 * learns a Tank exists (docs/design/hld.md → Ownership). Runs after auth, so an
 * unauthenticated request is a 401 whatever the id.
 */
export default class TankMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    // Only a 24-hex string passes, so a malformed id is a 404, not a CastError 500.
    const tankId: string = ctx.params.tankId
    const tank = isObjectIdOrHexString(tankId)
      ? await Tank.findOne({ _id: tankId, userId: ctx.userId })
      : null
    if (!tank) return ctx.response.notFound({ message: 'Tank not found' })
    ctx.tank = tank
    return next()
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    tank: TankDocument
  }
}
