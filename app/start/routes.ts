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
    // Lambda Web Adapter's readiness check (docs/design/lld.md). Boot waits for Mongo,
    // so a 503 means the connection dropped after boot.
    router.get('health', ({ response }) => {
      const connected = mongoose.connection.readyState === 1
      return response.status(connected ? 200 : 503).send({
        status: connected ? 'ok' : 'unavailable',
        database: connected ? 'connected' : 'disconnected',
      })
    })

    router.post('auth/register', [controllers.Auth, 'register'])
    router.post('auth/login', [controllers.Auth, 'login'])
    router.post('auth/logout', [controllers.Auth, 'logout'])

    router
      .group(() => {
        router.get('me', [controllers.Me, 'show'])
        router.patch('me', [controllers.Me, 'update'])
      })
      .use(middleware.auth())

    router
      .group(() => {
        router.get('tanks', [controllers.Tanks, 'index'])
        router.post('tanks', [controllers.Tanks, 'store'])
      })
      .use(middleware.auth())

    // Auth first, then the caller's Tank: no token is a 401 whatever the id;
    // after that a malformed, missing or foreign id is a 404 (docs/design/lld.md).
    router
      .group(() => {
        router.get('tanks/:tankId', [controllers.Tanks, 'show'])
        router.patch('tanks/:tankId', [controllers.Tanks, 'update'])
        router.delete('tanks/:tankId', [controllers.Tanks, 'destroy'])
        router.get('tanks/:tankId/water-changes', [controllers.WaterChanges, 'index'])
        router.post('tanks/:tankId/water-changes', [controllers.WaterChanges, 'store'])
      })
      .use([middleware.auth(), middleware.tank()])
  })
  .prefix('/api/v1')
