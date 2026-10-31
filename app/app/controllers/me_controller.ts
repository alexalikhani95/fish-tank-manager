import type { HttpContext } from '@adonisjs/core/http'

export default class MeController {
  /** GET /api/v1/me */
  async show({ user }: HttpContext) {
    return user
  }
}
