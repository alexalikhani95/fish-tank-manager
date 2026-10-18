import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import { ZodError } from 'zod'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    // A failed request schema is a 400 naming each bad field (docs/design/lld.md → API).
    // An unknown key is reported against that key; a whole-body rule has field ''.
    if (error instanceof ZodError) {
      return ctx.response.badRequest({
        errors: error.issues.flatMap((issue) =>
          issue.code === 'unrecognized_keys'
            ? issue.keys.map((key) => ({
                field: [...issue.path, key].join('.'),
                message: 'Unknown field',
              }))
            : [{ field: issue.path.join('.'), message: issue.message }]
        ),
      })
    }
    return super.handle(error, ctx)
  }
}
