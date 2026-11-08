import { z } from 'zod'
import { clock } from '#services/clock'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** UTC today plus one day, as `YYYY-MM-DD` (docs/design/lld.md → Data model). */
function latestDay() {
  const tomorrow = new Date(clock.now())
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  return tomorrow.toISOString().slice(0, 10)
}

/**
 * A real calendar day, exact `YYYY-MM-DD`: an overflow day such as 2023-02-29
 * does not survive a round trip through Date, and month 13 is not a Date at all.
 */
const day = z
  .string()
  // `abort` stops at the first failure: one error per field, and no Date of a malformed string.
  .regex(DAY, { error: 'Use a date in YYYY-MM-DD form', abort: true })
  .refine(
    (at) =>
      !Number.isNaN(Date.parse(`${at}T00:00:00Z`)) &&
      new Date(`${at}T00:00:00Z`).toISOString().slice(0, 10) === at,
    {
      error: 'Not a real date',
      abort: true,
    }
  )
  .refine((at) => at <= latestDay(), 'Date cannot be in the future')

/**
 * Unknown keys are stripped, like the Tank create schema, so a forged `tankId`
 * or `userId` never reaches the model. The note is kept exactly as sent:
 * empty and whitespace-only notes are valid, null is not.
 */
export const createWaterChangeSchema = z.object({
  at: day,
  percent: z.number().int().min(1).max(100),
  note: z.string().optional(),
})
