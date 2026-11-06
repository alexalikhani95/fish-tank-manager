import { z } from 'zod'

/** Exported for `user:set-password`, so the command and the API agree. */
export const emailRule = z.string().trim().toLowerCase().pipe(z.email())

/**
 * Length is the only rule, counted exactly as sent: the body parser doesn't
 * trim (config/bodyparser.ts), and neither does this.
 */
export const passwordRule = z.string().min(12).max(256)

/** Register and login. Unknown keys are stripped, like the Tank create schema. */
export const credentialsSchema = z.object({ email: emailRule, password: passwordRule })
