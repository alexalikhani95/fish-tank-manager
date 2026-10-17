import type { HttpContext } from '@adonisjs/core/http'
import { Tank } from '#models/tank'
import { createTankValidator, updateTankValidator } from '#validators/tank_validator'

/**
 * Every query filters on userId as well as the tank's own id. A Tank that is not
 * the caller's is a 404, never a 403 — the caller must not learn it exists
 * (docs/design/hld.md → Ownership).
 */
export default class TanksController {
  /** GET /api/v1/tanks */
  async index({ userId }: HttpContext) {
    return Tank.find({ userId }).sort({ createdAt: -1 })
  }

  /** POST /api/v1/tanks */
  async store({ request, response, userId }: HttpContext) {
    const payload = await request.validateUsing(createTankValidator)
    const tank = await Tank.create({ ...payload, userId })
    return response.created(tank)
  }

  /** GET /api/v1/tanks/:id */
  async show({ params, response, userId }: HttpContext) {
    const tank = await Tank.findOne({ _id: params.id, userId })
    if (!tank) return response.notFound({ message: 'Tank not found' })
    return tank
  }

  /** PATCH /api/v1/tanks/:id */
  async update({ params, request, response, userId }: HttpContext) {
    const payload = await request.validateUsing(updateTankValidator)
    const tank = await Tank.findOneAndUpdate({ _id: params.id, userId }, payload, {
      returnDocument: 'after',
    })
    if (!tank) return response.notFound({ message: 'Tank not found' })
    return tank
  }

  /** DELETE /api/v1/tanks/:id */
  async destroy({ params, response, userId }: HttpContext) {
    const tank = await Tank.findOneAndDelete({ _id: params.id, userId })
    if (!tank) return response.notFound({ message: 'Tank not found' })
    // Cascading WaterChanges, WaterTests and the S3 photo comes with those
    // features (docs/design/lld.md → Cascade delete).
    return response.noContent()
  }
}
