/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { connection } from 'mongoose'
import { controllers } from '#generated/controllers'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('health', () => ({
      status: 'ok',
      database: connection.readyState === 1 ? 'connected' : 'disconnected',
    }))

    router
      .group(() => {
        router.get('tanks', [controllers.Tanks, 'index'])
        router.post('tanks', [controllers.Tanks, 'store'])
        router.get('tanks/:id', [controllers.Tanks, 'show'])
        router.patch('tanks/:id', [controllers.Tanks, 'update'])
        router.delete('tanks/:id', [controllers.Tanks, 'destroy'])
      })
      .use(middleware.currentUser())
  })
  .prefix('/api/v1')
