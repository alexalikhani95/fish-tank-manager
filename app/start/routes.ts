/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import mongoose from 'mongoose'
import { controllers } from '#generated/controllers'
import { middleware } from '#start/kernel'

router
  .group(() => {
    // Lambda Web Adapter's readiness check: 503 until Mongo is connected (docs/design/lld.md).
    router.get('health', ({ response }) => {
      const connected = mongoose.connection.readyState === 1
      return response.status(connected ? 200 : 503).send({
        status: connected ? 'ok' : 'unavailable',
        database: connected ? 'connected' : 'disconnected',
      })
    })

    router
      .group(() => {
        router.get('tanks', [controllers.Tanks, 'index'])
        router.post('tanks', [controllers.Tanks, 'store'])
        router.get('tanks/:tankId', [controllers.Tanks, 'show'])
        router.patch('tanks/:tankId', [controllers.Tanks, 'update'])
        router.delete('tanks/:tankId', [controllers.Tanks, 'destroy'])
      })
      // Not an ObjectId → no route matches → 404, instead of a Mongoose CastError → 500.
      .where('tankId', /^[0-9a-f]{24}$/i)
      .use(middleware.currentUser())
  })
  .prefix('/api/v1')
