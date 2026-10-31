import { test } from '@japa/runner'
import { Types } from 'mongoose'
import type { ApiClient } from '@japa/api-client'
import hash from '@adonisjs/core/services/hash'
import { Tank } from '#models/tank'
import { User } from '#models/user'
import { jwtOf, tokenCookie, unauthorized } from '../helpers/auth.js'

const password = 'a long passphrase'

/** A real User made through the model (sign-up closes after the first), logged in over HTTP. */
async function createLoggedInUser(client: ApiClient, email: string) {
  const user = await User.create({ email, passwordHash: await hash.make(password) })
  const login = await client.post('/api/v1/auth/login').json({ email, password })
  return { user, login }
}

test.group('Tanks', (group) => {
  let userId: Types.ObjectId
  let cookie: string
  let jwt: string

  group.each.setup(async () => {
    await User.deleteMany({})
    await Tank.deleteMany({})
  })

  group.each.setup(async (t) => {
    const keeper = await createLoggedInUser(t.context.client, 'keeper@example.com')
    userId = keeper.user._id
    cookie = tokenCookie(keeper.login)
    jwt = jwtOf(keeper.login)
  })

  test('creates a tank for the current user', async ({ client, assert }) => {
    const response = await client
      .post('/api/v1/tanks')
      .header('cookie', cookie)
      .json({ name: 'Nano', volumeLitres: 30 })

    response.assertStatus(201)
    response.assertBodyContains({ name: 'Nano', volumeLitres: 30 })
    assert.equal(response.body().userId, userId.toString())
  })

  test('rejects a tank with no name, naming the field', async ({ client, assert }) => {
    const response = await client
      .post('/api/v1/tanks')
      .header('cookie', cookie)
      .json({ volumeLitres: 30 })

    response.assertStatus(400)
    assert.deepEqual(
      response.body().errors.map((error: { field: string }) => error.field),
      ['name']
    )
  })

  test('rejects a volume of zero', async ({ client }) => {
    const response = await client
      .post('/api/v1/tanks')
      .header('cookie', cookie)
      .json({ name: 'Nano', volumeLitres: 0 })

    response.assertStatus(400)
  })

  test('accepts any volume above zero', async ({ client }) => {
    const response = await client
      .post('/api/v1/tanks')
      .header('cookie', cookie)
      .json({ name: 'Jar', volumeLitres: 0.05 })

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

    const response = await client.get('/api/v1/tanks').header('cookie', cookie)

    response.assertStatus(200)
    assert.deepEqual(
      response.body().map((tank: { name: string }) => tank.name),
      ['Newer', 'Older']
    )
  })

  test('reads one tank', async ({ client }) => {
    const tank = await Tank.create({ name: 'Shrimp bowl', volumeLitres: 20, userId })

    const response = await client.get(`/api/v1/tanks/${tank.id}`).header('cookie', cookie)

    response.assertStatus(200)
    response.assertBodyContains({ name: 'Shrimp bowl' })
  })

  test('updates a tank', async ({ client }) => {
    const tank = await Tank.create({ name: 'Old name', volumeLitres: 54, userId })

    const response = await client
      .patch(`/api/v1/tanks/${tank.id}`)
      .header('cookie', cookie)
      .json({ name: 'New name' })

    response.assertStatus(200)
    response.assertBodyContains({ name: 'New name', volumeLitres: 54 })
  })

  test('rejects an update that sets the volume to zero', async ({ client }) => {
    const tank = await Tank.create({ name: 'Nano', volumeLitres: 30, userId })

    const response = await client
      .patch(`/api/v1/tanks/${tank.id}`)
      .header('cookie', cookie)
      .json({ volumeLitres: 0 })

    response.assertStatus(400)
  })

  test('rejects an update with a misspelled or empty body', async ({ client, assert }) => {
    const tank = await Tank.create({ name: 'Nano', volumeLitres: 30, userId })

    for (const body of [{ volume: 60 }, {}]) {
      const response = await client
        .patch(`/api/v1/tanks/${tank.id}`)
        .header('cookie', cookie)
        .json(body)
      response.assertStatus(400)
    }

    const misspelled = await client
      .patch(`/api/v1/tanks/${tank.id}`)
      .header('cookie', cookie)
      .json({ volume: 60 })
    assert.deepInclude(misspelled.body().errors, { field: 'volume', message: 'Unknown field' })
  })

  test('deletes a tank', async ({ client, assert }) => {
    const tank = await Tank.create({ name: 'Going', volumeLitres: 10, userId })

    const response = await client.delete(`/api/v1/tanks/${tank.id}`).header('cookie', cookie)

    response.assertStatus(204)
    assert.isNull(await Tank.findById(tank.id))
  })

  /**
   * The one that matters: a Tank belonging to someone else must look like it
   * does not exist, on every route (docs/design/hld.md → Ownership).
   */
  test("another user's tank is a 404, not a 403", async ({ client, assert }) => {
    const other = await createLoggedInUser(client, 'other@example.com')
    const theirs = await Tank.create({
      name: 'Not yours',
      volumeLitres: 100,
      userId: other.user._id,
    })

    // Positive control: the real owner reaches it, so the keeper's 404 is about ownership.
    const owner = await client
      .get(`/api/v1/tanks/${theirs.id}`)
      .header('cookie', tokenCookie(other.login))
    owner.assertStatus(200)

    for (const response of [
      await client.get(`/api/v1/tanks/${theirs.id}`).header('cookie', cookie),
      await client
        .patch(`/api/v1/tanks/${theirs.id}`)
        .header('cookie', cookie)
        .json({ name: 'Mine now' }),
      await client.delete(`/api/v1/tanks/${theirs.id}`).header('cookie', cookie),
    ]) {
      response.assertStatus(404)
    }

    // Untouched: a 404 that still wrote or deleted would be a leak.
    const after = await Tank.findById(theirs.id)
    assert.equal(after?.name, 'Not yours')
  })

  test('every tank route without a token is the exact 401', async ({ client }) => {
    const id = '0123456789abcdef01234567'

    for (const response of [
      await client.get('/api/v1/tanks'),
      await client.post('/api/v1/tanks').json({ name: 'Nano', volumeLitres: 30 }),
      await client.get(`/api/v1/tanks/${id}`),
      await client.patch(`/api/v1/tanks/${id}`).json({ name: 'x' }),
      await client.delete(`/api/v1/tanks/${id}`),
    ]) {
      response.assertStatus(401)
      response.assertBody(unauthorized)
    }
  })

  test('accepts an Authorization: Bearer header with no cookie', async ({ client, assert }) => {
    await Tank.create({ name: 'Mine', volumeLitres: 40, userId })
    await Tank.create({ name: 'Someone else', volumeLitres: 40, userId: new Types.ObjectId() })

    const response = await client.get('/api/v1/tanks').bearerToken(jwt)

    response.assertStatus(200)
    assert.deepEqual(
      response.body().map((tank: { name: string }) => tank.name),
      ['Mine']
    )
  })

  test('an id that is not an ObjectId is a 404, not a 500', async ({ client }) => {
    for (const response of [
      await client.get('/api/v1/tanks/abc').header('cookie', cookie),
      await client.patch('/api/v1/tanks/abc').header('cookie', cookie).json({ name: 'x' }),
      await client.delete('/api/v1/tanks/abc').header('cookie', cookie),
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
