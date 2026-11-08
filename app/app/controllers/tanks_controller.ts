import type { HttpContext } from '@adonisjs/core/http'
import { Tank } from '#models/tank'
import { WaterChange } from '#models/water_change'
import { createTankSchema, updateTankSchema } from '#validators/tank_validator'

/**
 * The list and create filter on userId themselves; `tanks/:tankId` routes get
 * the caller's Tank from the Tank middleware. A Tank that is not the caller's is
 * a 404, never a 403 — the caller must not learn it exists (docs/design/hld.md
 * → Ownership).
 */
export default class TanksController {
  /** GET /api/v1/tanks — each Tank with its derived `lastWaterChangeAt`. */
  async index({ userId }: HttpContext) {
    const tanks = await Tank.find({ userId }).sort({ createdAt: -1, _id: -1 })
    const latest = await WaterChange.aggregate<{ _id: unknown; at: string }>([
      { $match: { userId, tankId: { $in: tanks.map((tank) => tank._id) } } },
      { $group: { _id: '$tankId', at: { $max: '$at' } } },
    ])
    const latestByTank = new Map(latest.map((row) => [String(row._id), row.at]))
    return tanks.map((tank) => ({
      ...tank.toJSON(),
      lastWaterChangeAt: latestByTank.get(tank.id) ?? null,
    }))
  }

  /** POST /api/v1/tanks */
  async store({ request, response, userId }: HttpContext) {
    const payload = createTankSchema.parse(request.body())
    const tank = await Tank.create({ ...payload, userId })
    return response.created(tank)
  }

  /** GET /api/v1/tanks/:tankId — the Tank with its derived `lastWaterChangeAt`. */
  async show({ tank, userId }: HttpContext) {
    const latest = await WaterChange.findOne({ tankId: tank._id, userId }).sort({ at: -1 })
    return { ...tank.toJSON(), lastWaterChangeAt: latest?.at ?? null }
  }

  /** PATCH /api/v1/tanks/:tankId */
  async update({ request, response, tank, userId }: HttpContext) {
    const payload = updateTankSchema.parse(request.body())
    const updated = await Tank.findOneAndUpdate({ _id: tank._id, userId }, payload, {
      returnDocument: 'after',
      runValidators: true,
    })
    if (!updated) return response.notFound({ message: 'Tank not found' })
    return updated
  }

  /**
   * DELETE /api/v1/tanks/:tankId — children first, no transaction, so a failure
   * part-way leaves a Tank with an empty log, never WaterChanges without a Tank
   * (docs/design/lld.md → Cascade delete). Errors propagate as a 500.
   */
  async destroy({ response, tank, userId }: HttpContext) {
    await WaterChange.deleteMany({ tankId: tank._id, userId })
    await Tank.deleteOne({ _id: tank._id, userId })
    // WaterTests and the S3 photo join the cascade with those features.
    return response.noContent()
  }
}
