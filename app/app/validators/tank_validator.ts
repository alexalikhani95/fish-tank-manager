import { z } from 'zod'

/**
 * Volume is always litres here. The client converts from the User's preferred
 * unit before submitting — the API only ever stores canonical units
 * (docs/design/hld.md → Units).
 */
export const createTankSchema = z.object({
  name: z.string().trim().min(1).max(80),
  volumeLitres: z.number().positive(),
})

// Strict, and at least one field: a misspelled key must be a 400, not a silent no-op 200.
export const updateTankSchema = createTankSchema
  .partial()
  .strict()
  .refine((fields) => Object.keys(fields).length > 0, 'Send at least one field to change')
