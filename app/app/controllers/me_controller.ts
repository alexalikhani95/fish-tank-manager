import type { HttpContext } from '@adonisjs/core/http'
import { updateUserSchema } from '#validators/user_validator'

export default class MeController {
  /** GET /api/v1/me */
  async show({ user }: HttpContext) {
    return user
  }

  /** PATCH /api/v1/me */
  async update({ request, user }: HttpContext) {
    user.set(updateUserSchema.parse(request.body()))
    await user.save()
    return user
  }
}
