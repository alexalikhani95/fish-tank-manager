import type { HttpContext } from '@adonisjs/core/http'
import hash from '@adonisjs/core/services/hash'
import { mongo } from 'mongoose'
import { User } from '#models/user'
import { setTokenCookie } from '#services/auth_token'
import { credentialsSchema } from '#validators/auth_validator'

export default class AuthController {
  /**
   * POST /api/v1/auth/register
   *
   * Sign-up closes by itself once a User exists. The check runs before the
   * body is validated, so a closed sign-up answers every request the same way.
   */
  async register({ request, response }: HttpContext) {
    if (await User.exists({})) {
      return response.forbidden({ errors: [{ field: '', message: 'Sign-up is closed' }] })
    }

    const { email, password } = credentialsSchema.parse(request.body())
    let user
    try {
      user = await User.create({ email, passwordHash: await hash.make(password) })
    } catch (error) {
      // Only reachable when two first sign-ups race past the check above.
      if (error instanceof mongo.MongoServerError && error.code === 11000) {
        return response.conflict({ errors: [{ field: '', message: 'Email already registered' }] })
      }
      throw error
    }

    await setTokenCookie(response, user)
    return response.created(user)
  }
}
