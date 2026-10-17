import { Schema, model } from 'mongoose'

/**
 * A Tank belongs to exactly one User and is the aggregate root for its
 * WaterChanges and WaterTests — see CONTEXT.md.
 *
 * Only the fields the first slice needs. Brand, model, photo, fish and plants
 * follow in their own tickets (PLAN.md Phase 1).
 */
const tankSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    volumeLitres: { type: Number, required: true, min: 0.1 },
  },
  { timestamps: true }
)

export const Tank = model('Tank', tankSchema)
