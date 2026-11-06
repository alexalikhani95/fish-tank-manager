import { Schema, model } from 'mongoose'

/**
 * The person who signs up and logs in (CONTEXT.md). There is only ever one:
 * sign-up closes once a User exists.
 *
 * `tokenVersion` is in every login token; bumping it signs out every device.
 */
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    volumeUnit: { type: String, enum: ['L', 'usGal', 'ukGal'], default: 'L' },
    temperatureUnit: { type: String, enum: ['C', 'F'], default: 'C' },
    tokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      // The hash and the counter never leave the API.
      transform: (_doc, user: Record<string, unknown>) => {
        delete user.passwordHash
        delete user.tokenVersion
        delete user.__v
        return user
      },
    },
  }
)

export const User = model('User', userSchema)
