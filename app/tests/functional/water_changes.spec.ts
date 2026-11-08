import { test } from '@japa/runner'
import { Types } from 'mongoose'
import { Tank } from '#models/tank'
import { User } from '#models/user'
import { WaterChange } from '#models/water_change'
import { clock } from '#services/clock'
import { createLoggedInUser, jwtOf, tokenCookie, unauthorized } from '../helpers/auth.js'

test.group('WaterChanges', (group) => {
  let userId: Types.ObjectId
  let cookie: string
  let jwt: string
  let tankId: string
  const realNow = clock.now

  group.each.setup(async () => {
    await User.deleteMany({})
    await Tank.deleteMany({})
    await WaterChange.deleteMany({})
    return () => {
      clock.now = realNow
    }
  })

  group.each.setup(async (t) => {
    const keeper = await createLoggedInUser(t.context.client, 'keeper@example.com')
    userId = keeper.user._id
    cookie = tokenCookie(keeper.login)
    jwt = jwtOf(keeper.login)
    const tank = await Tank.create({ name: 'Nano', volumeLitres: 30, userId })
    tankId = tank.id
  })

  group.teardown(async () => {
    await WaterChange.deleteMany({})
  })

  /** Fix the API clock: the upper bound is this UTC instant's day plus one. */
  function setNow(iso: string) {
    clock.now = () => new Date(iso)
  }

  const url = () => `/api/v1/tanks/${tankId}/water-changes`

  test('logs a WaterChange and returns it with 201', async ({ client, assert }) => {
    const response = await client
      .post(url())
      .header('cookie', cookie)
      .json({ at: '2026-11-01', percent: 25, note: 'Cleaned the filter' })

    response.assertStatus(201)
    response.assertBodyContains({ at: '2026-11-01', percent: 25, note: 'Cleaned the filter' })
    assert.equal(response.body().tankId, tankId)
    assert.equal(response.body().userId, userId.toString())
    assert.isString(response.body()._id)

    const stored = await WaterChange.findById(response.body()._id)
    assert.equal(stored?.at, '2026-11-01')
  })

  test('ignores forged ownership fields and unknown keys', async ({ client, assert }) => {
    const elsewhere = new Types.ObjectId().toString()
    const response = await client.post(url()).header('cookie', cookie).json({
      at: '2026-11-01',
      percent: 10,
      tankId: elsewhere,
      userId: elsewhere,
      litres: 99,
    })

    response.assertStatus(201)
    assert.equal(response.body().tankId, tankId)
    assert.equal(response.body().userId, userId.toString())
    assert.notProperty(response.body(), 'litres')
  })

  test('an empty history is an empty array', async ({ client }) => {
    const response = await client.get(url()).header('cookie', cookie)

    response.assertStatus(200)
    response.assertBody([])
  })

  test('lists newest day first, then newest entry on the same day', async ({ client, assert }) => {
    for (const [at, percent] of [
      ['2026-10-01', 10],
      ['2026-11-01', 20],
      ['2026-11-01', 30],
      ['2026-10-15', 40],
    ] as const) {
      const created = await client.post(url()).header('cookie', cookie).json({ at, percent })
      created.assertStatus(201)
    }

    const response = await client.get(url()).header('cookie', cookie)

    response.assertStatus(200)
    assert.deepEqual(
      response.body().map((entry: { at: string; percent: number }) => [entry.at, entry.percent]),
      [
        ['2026-11-01', 30],
        ['2026-11-01', 20],
        ['2026-10-15', 40],
        ['2026-10-01', 10],
      ]
    )
  })

  test('lists only this Tank and this User', async ({ client, assert }) => {
    const otherTank = await Tank.create({ name: 'Other', volumeLitres: 60, userId })
    await WaterChange.create({ tankId: otherTank._id, userId, at: '2026-11-01', percent: 50 })
    // Belt and braces: a row with this tankId but another userId is never shown.
    await WaterChange.create({
      tankId,
      userId: new Types.ObjectId(),
      at: '2026-11-02',
      percent: 60,
    })
    await WaterChange.create({ tankId, userId, at: '2026-11-03', percent: 15 })

    const response = await client.get(url()).header('cookie', cookie)

    assert.deepEqual(
      response.body().map((entry: { percent: number }) => entry.percent),
      [15]
    )
  })

  test('keeps the note exactly as sent; omitted, empty and blank are valid', async ({
    client,
    assert,
  }) => {
    for (const [body, expected] of [
      [{}, undefined],
      [{ note: '' }, ''],
      [{ note: '   ' }, '   '],
      [{ note: '  Topped up  ' }, '  Topped up  '],
    ] as const) {
      // Through the real JSON body parser, which no longer turns '' into null.
      const response = await client
        .post(url())
        .header('cookie', cookie)
        .json({ at: '2026-11-01', percent: 20, ...body })
      response.assertStatus(201)
      assert.strictEqual(response.body().note, expected)
      const stored = await WaterChange.findById(response.body()._id)
      assert.strictEqual(stored?.note, expected)
    }
  })

  test('a null or non-string note is a 400 naming the field', async ({ client, assert }) => {
    for (const note of [null, 5, ['a'], { text: 'a' }]) {
      const response = await client
        .post(url())
        .header('cookie', cookie)
        .json({ at: '2026-11-01', percent: 20, note })
      response.assertStatus(400)
      assert.deepEqual(
        response.body().errors.map((error: { field: string }) => error.field),
        ['note']
      )
    }
    assert.equal(await WaterChange.countDocuments(), 0)
  })

  test('the percentage is an integer from 1 to 100', async ({ client, assert }) => {
    for (const percent of [1, 100]) {
      const response = await client
        .post(url())
        .header('cookie', cookie)
        .json({ at: '2026-11-01', percent })
      response.assertStatus(201)
    }
    for (const percent of [0, 101, -5, 2.5, '20', null, true, undefined]) {
      const response = await client
        .post(url())
        .header('cookie', cookie)
        .json({ at: '2026-11-01', percent })
      response.assertStatus(400)
      assert.deepEqual(
        response.body().errors.map((error: { field: string }) => error.field),
        ['percent']
      )
    }
  })

  test('the date must be an exact, real calendar day', async ({ client, assert }) => {
    setNow('2026-11-08T12:00:00Z')
    for (const at of [
      '2023-02-29',
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-11-1',
      '26-11-01',
      '2026/11/01',
      '2026-11-01T00:00:00Z',
      '2026-11-01 ',
      '',
      20261101,
      null,
      undefined,
    ]) {
      const response = await client.post(url()).header('cookie', cookie).json({ at, percent: 20 })
      response.assertStatus(400)
      assert.deepEqual(
        response.body().errors.map((error: { field: string }) => error.field),
        ['at'],
        `at: ${JSON.stringify(at)}`
      )
    }
    assert.equal(await WaterChange.countDocuments(), 0)
  })

  test('accepts leap days and old dates; no lower bound', async ({ client }) => {
    setNow('2026-11-08T12:00:00Z')
    for (const at of ['2024-02-29', '2000-02-29', '1999-01-01']) {
      const response = await client.post(url()).header('cookie', cookie).json({ at, percent: 20 })
      response.assertStatus(201)
    }
  })

  test('the latest allowed day is UTC today plus one', async ({ client }) => {
    async function post(at: string, status: number) {
      const response = await client.post(url()).header('cookie', cookie).json({ at, percent: 20 })
      response.assertStatus(status)
    }

    setNow('2026-11-08T00:00:00Z')
    await post('2026-11-09', 201)
    await post('2026-11-10', 400)

    setNow('2026-11-08T23:59:59.999Z')
    await post('2026-11-09', 201)
    await post('2026-11-10', 400)

    // Across a month end and into a leap day.
    setNow('2024-02-28T23:30:00Z')
    await post('2024-02-29', 201)
    await post('2024-03-01', 400)
    setNow('2024-02-29T10:00:00Z')
    await post('2024-03-01', 201)
    // Across a year end.
    setNow('2026-12-31T22:00:00Z')
    await post('2027-01-01', 201)
    await post('2027-01-02', 400)
  })

  test('a future date is a 400 with the validation envelope', async ({ client }) => {
    setNow('2026-11-08T12:00:00Z')
    const response = await client
      .post(url())
      .header('cookie', cookie)
      .json({ at: '2026-11-10', percent: 20 })

    response.assertStatus(400)
    response.assertBody({ errors: [{ field: 'at', message: 'Date cannot be in the future' }] })
  })

  test('allows several WaterChanges on the same day', async ({ client, assert }) => {
    for (let i = 0; i < 2; i++) {
      const response = await client
        .post(url())
        .header('cookie', cookie)
        .json({ at: '2026-11-01', percent: 20 })
      response.assertStatus(201)
    }
    assert.equal(await WaterChange.countDocuments({ tankId }), 2)
  })

  test("another User's, a missing or a malformed Tank is a 404", async ({ client, assert }) => {
    const other = await createLoggedInUser(client, 'other@example.com')
    const theirs = await Tank.create({
      name: 'Not yours',
      volumeLitres: 100,
      userId: other.user._id,
    })
    await WaterChange.create({
      tankId: theirs._id,
      userId: other.user._id,
      at: '2026-11-01',
      percent: 30,
    })

    // Positive control: the real owner reaches it.
    const owner = await client
      .get(`/api/v1/tanks/${theirs.id}/water-changes`)
      .header('cookie', tokenCookie(other.login))
    owner.assertStatus(200)
    assert.lengthOf(owner.body(), 1)

    for (const id of [
      theirs.id,
      new Types.ObjectId().toString(),
      'abc',
      '0123456789abcdef0123456z',
    ]) {
      const list = await client.get(`/api/v1/tanks/${id}/water-changes`).header('cookie', cookie)
      list.assertStatus(404)
      const create = await client
        .post(`/api/v1/tanks/${id}/water-changes`)
        .header('cookie', cookie)
        .json({ at: '2026-11-01', percent: 20 })
      create.assertStatus(404)
    }
    assert.equal(await WaterChange.countDocuments({ tankId: theirs._id }), 1)
    assert.equal(await WaterChange.countDocuments({ userId }), 0)
  })

  test('without a token it is the exact 401, even for a malformed id', async ({ client }) => {
    for (const id of [tankId, 'abc']) {
      for (const response of [
        await client.get(`/api/v1/tanks/${id}/water-changes`),
        await client
          .post(`/api/v1/tanks/${id}/water-changes`)
          .json({ at: '2026-11-01', percent: 20 }),
      ]) {
        response.assertStatus(401)
        response.assertBody(unauthorized)
      }
    }
  })

  test('accepts an Authorization: Bearer header with no cookie', async ({ client }) => {
    const created = await client
      .post(url())
      .bearerToken(jwt)
      .json({ at: '2026-11-01', percent: 20 })
    created.assertStatus(201)

    const response = await client.get(url()).bearerToken(jwt)
    response.assertStatus(200)
    response.assertBodyContains([{ at: '2026-11-01', percent: 20 }])
  })
})
