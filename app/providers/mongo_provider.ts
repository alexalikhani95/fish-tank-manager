import type { ApplicationService } from '@adonisjs/core/types'
import mongoose from 'mongoose'
import env from '#start/env'

/**
 * Mongoose is wired in as a provider because this app has no Lucid (ADR-0003).
 * One connection is opened at boot and reused — on Lambda that means warm
 * invocations share it instead of reconnecting per request (ADR-0004).
 */
export default class MongoProvider {
  constructor(protected app: ApplicationService) {}

  async start() {
    await mongoose.connect(env.get('MONGO_URL'))
  }

  async shutdown() {
    await mongoose.disconnect()
  }
}
