import { defineConfig } from '@adonisjs/core/bodyparser'

/**
 * JSON only. No form or multipart parsing: a cross-site HTML form can't send
 * JSON, which is half of the CSRF defence the auth cookie relies on (ADR-0006).
 * Photos go straight to S3 by presigned URL, so nothing needs multipart.
 *
 * `types: []` rather than deleting the keys: `defineConfig` merges the
 * defaults back in for any key that is missing.
 */
const bodyParserConfig = defineConfig({
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  form: {
    types: [],
  },

  json: {
    convertEmptyStringsToNull: true,

    /**
     * Off so a password counts exactly as sent. Fields that should be trimmed
     * (email, Tank name) say so in their Zod schema.
     */
    trimWhitespaces: false,

    types: [
      'application/json',
      'application/json-patch+json',
      'application/vnd.api+json',
      'application/csp-report',
    ],
  },

  multipart: {
    types: [],
  },
})

export default bodyParserConfig
