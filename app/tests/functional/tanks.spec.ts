import { test } from '@japa/runner'
import { Types } from 'mongoose'
import { Tank } from '#models/tank'
import env from '#start/env'

const userId = env.get('DEV_USER_ID')

test.group('Tanks', (group) => {
  group.each.setup(async () => {
    await Tank.deleteMany({})
  })

  test('creates a tank for the current user', async ({ client, assert }) => {
    const response = await client.post('/api/v1/tanks').json({ name: 'Nano', volumeLitres: 30 })

    response.assertStatus(201)
    response.assertBodyContains({ name: 'Nano', volumeLitres: 30 })
    assert.equal(response.body().userId, userId)
  })

  test('rejects a tank with no name, naming the field', async ({ client, assert }) => {
    const response = await client.post('/api/v1/tanks').json({ volumeLitres: 30 })

    response.assertStatus(400)
    assert.deepEqual(
      response.body().errors.map((error: { field: string }) => error.field),
      ['name']
    )
  })

  test('rejects a volume of zero', async ({ client }) => {
    const response = await client.post('/api/v1/tanks').json({ name: 'Nano', volumeLitres: 0 })

    response.assertStatus(400)
  })

  test('accepts any volume above zero', async ({ client }) => {
    const response = await client.post('/api/v1/tanks').json({ name: 'Jar', volumeLitres: 0.05 })

    response.assertStatus(201)
  })

  test('lists only the current user tanks, newest first', async ({ client, assert }) => {
    await Tank.create({ name: 'Older', volumeLitres: 60, userId })
    await Tank.create({ name: 'Newer', volumeLitres: 120, userId })
    await Tank.create({
      name: 'Someone else',
      volumeLitres: 200,
      userId: new Types.ObjectId(),
    })

    const response = await client.get('/api/v1/tanks')

    response.assertStatus(200)
    assert.deepEqual(
      response.body().map((tank: { name: string }) => tank.name),
      ['Newer', 'Older']
    )
  })

  test('reads one tank', async ({ client }) => {
    const tank = await Tank.create({ name: 'Shrimp bowl', volumeLitres: 20, userId })

    const response = await client.get(`/api/v1/tanks/${tank.id}`)

    response.assertStatus(200)
    response.assertBodyContains({ name: 'Shrimp bowl' })
  })

  test('updates a tank', async ({ client }) => {
    const tank = await Tank.create({ name: 'Old name', volumeLitres: 54, userId })

    const response = await client.patch(`/api/v1/tanks/${tank.id}`).json({ name: 'New name' })

    response.assertStatus(200)
    response.assertBodyContains({ name: 'New name', volumeLitres: 54 })
  })

  test('rejects an update that sets the volume to zero', async ({ client }) => {
    const tank = await Tank.create({ name: 'Nano', volumeLitres: 30, userId })

    const response = await client.patch(`/api/v1/tanks/${tank.id}`).json({ volumeLitres: 0 })

    response.assertStatus(400)
  })

  test('rejects an update with a misspelled or empty body', async ({ client, assert }) => {
    const tank = await Tank.create({ name: 'Nano', volumeLitres: 30, userId })

    for (const body of [{ volume: 60 }, {}]) {
      const response = await client.patch(`/api/v1/tanks/${tank.id}`).json(body)
      response.assertStatus(400)
    }

    const misspelled = await client.patch(`/api/v1/tanks/${tank.id}`).json({ volume: 60 })
    assert.deepInclude(misspelled.body().errors, { field: 'volume', message: 'Unknown field' })
  })

  test('deletes a tank', async ({ client, assert }) => {
    const tank = await Tank.create({ name: 'Going', volumeLitres: 10, userId })

    const response = await client.delete(`/api/v1/tanks/${tank.id}`)

    response.assertStatus(204)
    assert.isNull(await Tank.findById(tank.id))
  })

  /**
   * The one that matters: a Tank belonging to someone else must look like it
   * does not exist, on every route (docs/design/hld.md → Ownership).
   */
  test("another user's tank is a 404, not a 403", async ({ client }) => {
    const theirs = await Tank.create({
      name: 'Not yours',
      volumeLitres: 100,
      userId: new Types.ObjectId(),
    })

    for (const response of [
      await client.get(`/api/v1/tanks/${theirs.id}`),
      await client.patch(`/api/v1/tanks/${theirs.id}`).json({ name: 'Mine now' }),
      await client.delete(`/api/v1/tanks/${theirs.id}`),
    ]) {
      response.assertStatus(404)
    }
  })

  test('an id that is not an ObjectId is a 404, not a 500', async ({ client }) => {
    for (const response of [
      await client.get('/api/v1/tanks/abc'),
      await client.patch('/api/v1/tanks/abc').json({ name: 'x' }),
      await client.delete('/api/v1/tanks/abc'),
    ]) {
      response.assertStatus(404)
    }
  })
})

test.group('Health', () => {
  test('reports the database connection', async ({ client }) => {
    const response = await client.get('/api/v1/health')

    response.assertStatus(200)
    response.assertBody({ status: 'ok', database: 'connected' })
  })
})
