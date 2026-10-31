import { test } from '@japa/runner'
import type { ApiResponse } from '@japa/api-client'
import hash from '@adonisjs/core/services/hash'
import { SignJWT } from 'jose'
import { User } from '#models/user'
import env from '#start/env'

const credentials = { email: 'keeper@example.com', password: 'a long passphrase' }

const unauthorized = { errors: [{ field: '', message: 'Unauthorized' }] }

/** The `token` Set-Cookie line, if the response set one. */
function tokenSetCookie(response: ApiResponse): string | undefined {
  const setCookie: string[] = [response.headers()['set-cookie'] ?? []].flat()
  return setCookie.find((line) => line.startsWith('token='))
}

/**
 * `token=<jwt>`, ready to send back as a raw `cookie` header. Japa's cookie
 * helpers sign or encode values, which a bare JWT must not be.
 */
function tokenCookie(response: ApiResponse): string {
  const line = tokenSetCookie(response)
  if (!line) throw new Error('response set no token cookie')
  return line.split(';')[0]
}

function jwtOf(response: ApiResponse): string {
  return tokenCookie(response).slice('token='.length)
}

/** The only tokens tests build themselves: signed with the test JWT_SECRET. */
function signWithTestSecret(jwt: SignJWT): Promise<string> {
  return jwt
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(env.get('JWT_SECRET')))
}

test.group('Register', (group) => {
  group.each.setup(async () => {
    await User.deleteMany({})
  })

  test('creates the User, logs them in and returns them', async ({ client, assert }) => {
    const response = await client.post('/api/v1/auth/register').json(credentials)

    response.assertStatus(201)
    assert.sameMembers(Object.keys(response.body()), [
      '_id',
      'email',
      'volumeUnit',
      'temperatureUnit',
      'createdAt',
      'updatedAt',
    ])
    assert.equal(response.body().email, 'keeper@example.com')

    const me = await client.get('/api/v1/me').header('cookie', tokenCookie(response))
    me.assertStatus(200)
    assert.equal(me.body()._id, response.body()._id)
  })

  test('a new User defaults to litres and °C', async ({ client }) => {
    const response = await client.post('/api/v1/auth/register').json(credentials)

    response.assertBodyContains({ volumeUnit: 'L', temperatureUnit: 'C' })
  })

  test('trims and lowercases the email', async ({ client }) => {
    const response = await client
      .post('/api/v1/auth/register')
      .json({ ...credentials, email: '  Keeper@Example.COM ' })

    response.assertStatus(201)
    response.assertBodyContains({ email: 'keeper@example.com' })
  })

  test('ignores keys it does not know', async ({ client }) => {
    const response = await client
      .post('/api/v1/auth/register')
      .json({ ...credentials, volumeUnit: 'usGal', tokenVersion: 7 })

    response.assertStatus(201)
    response.assertBodyContains({ volumeUnit: 'L' })
  })

  test('sets the token cookie with every attribute explicit', async ({ client, assert }) => {
    const response = await client.post('/api/v1/auth/register').json(credentials)

    const attributes = tokenSetCookie(response)!
      .split(';')
      .slice(1)
      .map((attribute) => attribute.trim().toLowerCase())
    assert.sameMembers(attributes, [
      'max-age=2592000',
      'path=/',
      'httponly',
      'secure',
      'samesite=lax',
    ])
  })

  test('rejects an invalid email or password, naming the field', async ({ client, assert }) => {
    for (const [body, field] of [
      [{ ...credentials, email: 'not an email' }, 'email'],
      [{ ...credentials, password: 'x'.repeat(11) }, 'password'],
      [{ ...credentials, password: 'x'.repeat(257) }, 'password'],
      [{ email: credentials.email }, 'password'],
    ] as const) {
      const response = await client.post('/api/v1/auth/register').json(body)

      response.assertStatus(400)
      assert.deepEqual(
        response.body().errors.map((error: { field: string }) => error.field),
        [field]
      )
      assert.isUndefined(tokenSetCookie(response))
    }
  })

  test('accepts passwords of exactly 12 and 256 characters', async ({ client }) => {
    for (const password of ['x'.repeat(12), 'x'.repeat(256)]) {
      await User.deleteMany({})
      const response = await client.post('/api/v1/auth/register').json({ ...credentials, password })
      response.assertStatus(201)
    }
  })

  test('counts the password exactly as sent, spaces included', async ({ client }) => {
    const response = await client
      .post('/api/v1/auth/register')
      .json({ ...credentials, password: `${'x'.repeat(11)} ` })

    response.assertStatus(201)
  })

  test('is closed once a User exists, whatever the body', async ({ client, assert }) => {
    await User.create({ email: 'first@example.com', passwordHash: await hash.make('x'.repeat(12)) })

    for (const body of [credentials, {}]) {
      const response = await client.post('/api/v1/auth/register').json(body)

      response.assertStatus(403)
      response.assertBody({ errors: [{ field: '', message: 'Sign-up is closed' }] })
      assert.isUndefined(tokenSetCookie(response))
    }
  })

  test('parses only JSON: a form-encoded body logs nobody in', async ({ client, assert }) => {
    const response = await client.post('/api/v1/auth/register').form(credentials)

    assert.notEqual(response.status(), 201)
    assert.isUndefined(tokenSetCookie(response))
  })
})

test.group('Me', (group) => {
  group.each.setup(async () => {
    await User.deleteMany({})
  })

  test('works with a bearer header and no cookie', async ({ client }) => {
    const registered = await client.post('/api/v1/auth/register').json(credentials)

    const response = await client.get('/api/v1/me').bearerToken(jwtOf(registered))

    response.assertStatus(200)
    response.assertBodyContains({ email: 'keeper@example.com' })
  })

  test('is a 401 with no token', async ({ client }) => {
    const response = await client.get('/api/v1/me')

    response.assertStatus(401)
    response.assertBody(unauthorized)
  })

  test('is a 401 with a tampered token', async ({ client }) => {
    const registered = await client.post('/api/v1/auth/register').json(credentials)
    const jwt = jwtOf(registered)
    const signature = jwt.slice(jwt.lastIndexOf('.') + 1)
    const tampered = `${jwt.slice(0, jwt.lastIndexOf('.') + 1)}${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`

    const response = await client.get('/api/v1/me').header('cookie', `token=${tampered}`)

    response.assertStatus(401)
    response.assertBody(unauthorized)
  })

  test('is a 401 with an expired token', async ({ client }) => {
    const registered = await client.post('/api/v1/auth/register').json(credentials)
    const expired = await signWithTestSecret(
      new SignJWT({ tokenVersion: 0 })
        .setSubject(registered.body()._id)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    )

    const response = await client.get('/api/v1/me').header('cookie', `token=${expired}`)

    response.assertStatus(401)
    response.assertBody(unauthorized)
  })

  test('is a 401 once the token is revoked', async ({ client }) => {
    const registered = await client.post('/api/v1/auth/register').json(credentials)
    await User.updateOne({ _id: registered.body()._id }, { $inc: { tokenVersion: 1 } })

    const response = await client.get('/api/v1/me').header('cookie', tokenCookie(registered))

    response.assertStatus(401)
    response.assertBody(unauthorized)
  })

  test('is a 401 once the User is deleted', async ({ client }) => {
    const registered = await client.post('/api/v1/auth/register').json(credentials)
    await User.deleteOne({ _id: registered.body()._id })

    const response = await client.get('/api/v1/me').header('cookie', tokenCookie(registered))

    response.assertStatus(401)
    response.assertBody(unauthorized)
  })

  test('tries only the cookie when one is sent, even an empty one', async ({ client }) => {
    const registered = await client.post('/api/v1/auth/register').json(credentials)

    for (const cookie of ['token=not-a-jwt', 'token=']) {
      const response = await client
        .get('/api/v1/me')
        .header('cookie', cookie)
        .bearerToken(jwtOf(registered))

      response.assertStatus(401)
      response.assertBody(unauthorized)
    }
  })

  test('matches the bearer scheme in any case', async ({ client }) => {
    const registered = await client.post('/api/v1/auth/register').json(credentials)

    const response = await client
      .get('/api/v1/me')
      .header('authorization', `bearer ${jwtOf(registered)}`)

    response.assertStatus(200)
  })

  test('is a 401 for a signed token with a bad subject or no expiry', async ({ client }) => {
    const registered = await client.post('/api/v1/auth/register').json(credentials)
    const inAnHour = Math.floor(Date.now() / 1000) + 3600

    for (const token of [
      new SignJWT({ tokenVersion: 0 }).setSubject('nope').setExpirationTime(inAnHour),
      new SignJWT({ tokenVersion: 0 }).setSubject(registered.body()._id),
      new SignJWT({ tokenVersion: '0' })
        .setSubject(registered.body()._id)
        .setExpirationTime(inAnHour),
    ]) {
      const response = await client
        .get('/api/v1/me')
        .header('cookie', `token=${await signWithTestSecret(token)}`)

      response.assertStatus(401)
      response.assertBody(unauthorized)
    }
  })
})
