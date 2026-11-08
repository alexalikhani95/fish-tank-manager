/**
 * The API's notion of "now". A seam so tests can fix the clock for date bounds
 * without touching the global Date that JWT expiry and timestamps also read.
 */
export const clock = { now: () => new Date() }
