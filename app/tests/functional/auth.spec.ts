import { test } from '@japa/runner'
import type { ApiResponse } from '@japa/api-client'
import type { Assert } from '@japa/assert'
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
      .json({ ...credentials, volumeUnit: 'usGal', tokenVersion: 7, passwordHash: 'x' })

    response.assertStatus(201)
    response.assertBodyContains({ volumeUnit: 'L' })

    // passwordHash was stripped: the sent password logs in (a stored 'x' would fail to verify).
    const login = await client.post('/api/v1/auth/login').json(credentials)
    login.assertStatus(200)

    // tokenVersion was stripped: only a stored 0 accepts a token signed with 0.
    const token = await signWithTestSecret(
      new SignJWT({ tokenVersion: 0 })
        .setSubject(response.body()._id)
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    )
    const me = await client.get('/api/v1/me').header('cookie', `token=${token}`)
    me.assertStatus(200)
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

test.group('Login', (group) => {
  group.each.setup(async () => {
    await User.deleteMany({})
  })

  test('logs in with the right credentials, returns the User and sets the cookie', async ({
    client,
    assert,
  }) => {
    const registered = await client.post('/api/v1/auth/register').json(credentials)

    const response = await client
      .post('/api/v1/auth/login')
      .json({ email: ' Keeper@Example.com ', password: credentials.password })

    response.assertStatus(200)
    assert.equal(response.body()._id, registered.body()._id)
    assert.sameMembers(Object.keys(response.body()), Object.keys(registered.body()))
    const me = await client.get('/api/v1/me').header('cookie', tokenCookie(response))
    me.assertStatus(200)
  })

  test('a wrong password and an unknown email get the identical 401', async ({
    client,
    assert,
  }) => {
    await client.post('/api/v1/auth/register').json(credentials)

    const wrongPassword = await client
      .post('/api/v1/auth/login')
      .json({ ...credentials, password: 'the wrong passphrase' })
    const unknownEmail = await client
      .post('/api/v1/auth/login')
      .json({ ...credentials, email: 'nobody@example.com' })

    wrongPassword.assertStatus(401)
    unknownEmail.assertStatus(401)
    wrongPassword.assertBody(unauthorized)
    assert.deepEqual(unknownEmail.body(), wrongPassword.body())
    assert.isUndefined(wrongPassword.headers()['set-cookie'])
    assert.isUndefined(unknownEmail.headers()['set-cookie'])
    const withoutVolatile = (response: ApiResponse) => {
      const headers = { ...response.headers() }
      delete headers['x-request-id']
      delete headers.date
      return headers
    }
    assert.deepEqual(withoutVolatile(unknownEmail), withoutVolatile(wrongPassword))
  })

  test('rejects an invalid body, naming the field', async ({ client, assert }) => {
    const response = await client.post('/api/v1/auth/login').json({ email: 'nope', password: 'x' })

    response.assertStatus(400)
    assert.sameMembers(
      response.body().errors.map((error: { field: string }) => error.field),
      ['email', 'password']
    )
  })

  test('a form-encoded login is not a 200 and sets no cookie', async ({ client, assert }) => {
    await client.post('/api/v1/auth/register').json(credentials)

    const response = await client.post('/api/v1/auth/login').form(credentials)

    assert.notEqual(response.status(), 200)
    assert.isUndefined(tokenSetCookie(response))
  })

  test('passwords are never trimmed: a trailing space must match', async ({ client }) => {
    const password = `${'x'.repeat(11)} `
    const registered = await client.post('/api/v1/auth/register').json({ ...credentials, password })
    registered.assertStatus(201)

    const exact = await client.post('/api/v1/auth/login').json({ ...credentials, password })
    const trimmed = await client
      .post('/api/v1/auth/login')
      .json({ ...credentials, password: 'x'.repeat(12) })

    exact.assertStatus(200)
    trimmed.assertStatus(401)
  })

  test('sets the same cookie attributes as register', async ({ client, assert }) => {
    await client.post('/api/v1/auth/register').json(credentials)

    const response = await client.post('/api/v1/auth/login').json(credentials)

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
})

test.group('Logout', (group) => {
  group.each.setup(async () => {
    await User.deleteMany({})
  })

  /** The clearing Set-Cookie must overwrite the real one: same name, path, no Domain, Secure. */
  function assertCleared(response: ApiResponse, assert: Assert) {
    const line = tokenSetCookie(response)
    assert.exists(line)
    assert.equal(line!.split(';')[0], 'token=')
    const attributes = line!
      .split(';')
      .slice(1)
      .map((attribute) => attribute.trim().toLowerCase())
    for (const expected of ['path=/', 'httponly', 'secure', 'samesite=lax']) {
      assert.include(attributes, expected)
    }
    assert.notExists(attributes.find((attribute) => attribute.startsWith('domain')))
    const expires = attributes.find((attribute) => attribute.startsWith('expires='))
    const maxAge = attributes.find((attribute) => attribute.startsWith('max-age='))
    assert.isTrue(
      maxAge === 'max-age=0' ||
        (expires !== undefined && Date.parse(expires.slice('expires='.length)) < Date.now())
    )
  }

  test('returns 204 and clears the cookie with matching attributes', async ({ client, assert }) => {
    const registered = await client.post('/api/v1/auth/register').json(credentials)

    const response = await client
      .post('/api/v1/auth/logout')
      .header('cookie', tokenCookie(registered))

    response.assertStatus(204)
    assertCleared(response, assert)
  })

  test('needs no auth: no cookie, or an expired or tampered one, is still 204', async ({
    client,
    assert,
  }) => {
    const registered = await client.post('/api/v1/auth/register').json(credentials)
    const expired = await signWithTestSecret(
      new SignJWT({ tokenVersion: 0 })
        .setSubject(registered.body()._id)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    )

    for (const cookie of [undefined, `token=${expired}`, 'token=not-a-jwt']) {
      const request = client.post('/api/v1/auth/logout')
      if (cookie) request.header('cookie', cookie)
      const response = await request

      response.assertStatus(204)
      assertCleared(response, assert)
    }
  })

  test('signs out only this device: another token still reaches me', async ({ client }) => {
    const registered = await client.post('/api/v1/auth/register').json(credentials)
    const otherDevice = await client.post('/api/v1/auth/login').json(credentials)

    await client.post('/api/v1/auth/logout').header('cookie', tokenCookie(registered))

    const me = await client.get('/api/v1/me').header('cookie', tokenCookie(otherDevice))
    me.assertStatus(200)
    const same = await client.get('/api/v1/me').header('cookie', tokenCookie(registered))
    same.assertStatus(200)
  })
})
