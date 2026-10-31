import { defineConfig, drivers } from '@adonisjs/core/hash'

/**
 * Hashes User passwords (ADR-0003, ADR-0009). Scrypt is Adonis's default and
 * needs no native module, which keeps the Lambda build simple.
 */
const hashConfig = defineConfig({
  default: 'scrypt',
  list: {
    scrypt: drivers.scrypt({
      cost: 16384,
      blockSize: 8,
      parallelization: 1,
      maxMemory: 33554432,
    }),
  },
})

export default hashConfig

declare module '@adonisjs/core/types' {
  export interface HashersList extends InferHashers<typeof hashConfig> {}
}
