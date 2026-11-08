import type { HttpContext } from '@adonisjs/core/http'
import { WaterChange } from '#models/water_change'
import { createWaterChangeSchema } from '#validators/water_change_validator'

/**
 * The Tank middleware has already loaded the caller's Tank. Child queries still
 * filter on both ids (docs/design/lld.md → Ownership check).
 */
export default class WaterChangesController {
  /** GET /api/v1/tanks/:tankId/water-changes — newest day first, then newest entry. */
  async index({ tank, userId }: HttpContext) {
    return WaterChange.find({ tankId: tank._id, userId }).sort({ at: -1, _id: -1 })
  }

  /** POST /api/v1/tanks/:tankId/water-changes */
  async store({ request, response, tank, userId }: HttpContext) {
    const payload = createWaterChangeSchema.parse(request.body())
    const waterChange = await WaterChange.create({ ...payload, tankId: tank._id, userId })
    return response.created(waterChange)
  }
}
