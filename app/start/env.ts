/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'
import { isObjectIdOrHexString } from 'mongoose'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Signs the login token (ADR-0009). Refused at boot when missing or short.
  JWT_SECRET: (key: string, value?: string) => {
    if (!value || value.length < 32) {
      throw new Error(`${key} must be at least 32 characters (e.g. openssl rand -base64 48)`)
    }
    return value
  },

  // MongoDB — the only database (ADR-0002)
  MONGO_URL: Env.schema.string(),

  // ponytail: stands in for the authenticated User until the JWT guard
  // lands (ADR-0003/0006), then it goes away. Refused in production: with it,
  // every caller would act as that one User.
  DEV_USER_ID: (key: string, value?: string) => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `${key} is a dev-only stub; the API cannot run in production until the JWT guard lands`
      )
    }
    if (!value || !isObjectIdOrHexString(value)) {
      throw new Error(`${key} must be a 24-character hex ObjectId`)
    }
    return value
  },
})
