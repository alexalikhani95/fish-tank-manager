import type { HttpContext } from '@adonisjs/core/http'
import hash from '@adonisjs/core/services/hash'
import { mongo } from 'mongoose'
import { User } from '#models/user'
import { clearTokenCookie, setTokenCookie, UNAUTHORIZED_BODY } from '#services/auth_token'
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

  /** POST /api/v1/auth/login. A wrong password and an unknown email look the same. */
  async login({ request, response }: HttpContext) {
    const { email, password } = credentialsSchema.parse(request.body())
    const user = await User.findOne({ email })
    // An unknown email still verifies against a dummy hash, so timing doesn't give it away.
    // Awaited on every login, before branching, so found and unknown emails do the same work.
    const fallback = await dummyHash()
    const valid = await hash.verify(user?.passwordHash ?? fallback, password)
    if (!user || !valid) return response.unauthorized(UNAUTHORIZED_BODY)

    await setTokenCookie(response, user)
    return user
  }

  /** POST /api/v1/auth/logout. No auth, so a stale cookie is cleared too. */
  async logout({ response }: HttpContext) {
    clearTokenCookie(response)
    return response.noContent()
  }
}

let dummyHashPromise: Promise<string> | undefined
function dummyHash() {
  dummyHashPromise ??= hash.make('dummy password')
  return dummyHashPromise
}
