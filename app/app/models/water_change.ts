import { Schema, model } from 'mongoose'

/**
 * One entry in a Tank's log: the day water was replaced and the percentage of
 * the Tank's Volume replaced — see CONTEXT.md. `at` is a `YYYY-MM-DD` string,
 * a day, not an instant (docs/design/lld.md → Data model).
 */
const waterChangeSchema = new Schema(
  {
    tankId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    at: { type: String, required: true },
    percent: { type: Number, required: true, min: 1, max: 100 },
    note: { type: String },
  },
  { timestamps: true }
)
// Newest first, and the Tank's last WaterChange.
waterChangeSchema.index({ tankId: 1, at: -1 })

export const WaterChange = model('WaterChange', waterChangeSchema)
