import { z } from 'zod'

// Strict, and at least one field, like the Tank update schema. Units are enums, so nothing to trim.
export const updateUserSchema = z
  .object({
    volumeUnit: z.enum(['L', 'usGal', 'ukGal']),
    temperatureUnit: z.enum(['C', 'F']),
  })
  .partial()
  .strict()
  .refine((fields) => Object.keys(fields).length > 0, 'Send at least one field to change')
