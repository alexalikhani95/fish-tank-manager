import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import app from '@adonisjs/core/services/app'
import SetPassword from '#commands/set_password'
import { Tank } from '#models/tank'
import { User } from '#models/user'
import { createLoggedInUser, password, tokenCookie, unauthorized } from '../helpers/auth.js'

const email = 'keeper@example.com'

/**
 * The command, created in-process with its output captured (raw mode). A prompt
 * with no trap throws at once instead of waiting on stdin (which hangs a TTY run).
 * `exec()` catches that throw into `command.error`, so tests must check it.
 */
async function createCommand(argument: string) {
  const ace = await app.container.make('ace')
  ace.ui.switchMode('raw')
  // The UI is shared by every command: start each one with no logs.
  ace.ui.logger.flushLogs()
  const command = await ace.create(SetPassword, [argument])
  Object.assign(command.prompt, {
    prompt(options: { message: string }) {
      throw new Error(`untrapped prompt: ${options.message}`)
    },
  })
  return command
}

/** Answers both hidden prompts, runs the command, and checks both prompts were asked. */
async function runWith(argument: string, newPassword: string, confirmation: string) {
  const command = await createCommand(argument)
  command.prompt.trap('New password').replyWith(newPassword)
  command.prompt.trap('Confirm password').replyWith(confirmation)
  await command.exec()
  // A refusal sets the exit code without throwing; a throw is a bug, not a refusal.
  if (command.error) throw command.error
  command.prompt.traps.verify()
  return command
}

/** Nothing changed: the old password still logs in and the old token still reaches `GET me`. */
async function assertUnchanged(client: ApiClient, cookie: string) {
  const login = await client.post('/api/v1/auth/login').json({ email, password })
  login.assertStatus(200)
  const me = await client.get('/api/v1/me').header('cookie', cookie)
  me.assertStatus(200)
}

function assertPasswordNotPrinted(
  assert: Assert,
  command: Awaited<ReturnType<typeof createCommand>>,
  secret: string
) {
  for (const log of command.ui.logger.getLogs()) {
    assert.notInclude(log.message, secret)
  }
}

test.group('user:set-password', (group) => {
  let cookie: string

  group.each.setup(async () => {
    await User.deleteMany({})
    await Tank.deleteMany({})
  })

  group.each.setup(async (t) => {
    const keeper = await createLoggedInUser(t.context.client, email)
    cookie = tokenCookie(keeper.login)
  })

  test('sets the new password and signs out every device', async ({ client, assert }) => {
    const newPassword = 'a brand new passphrase'

    const command = await runWith(email, newPassword, newPassword)

    command.assertSucceeded()
    assertPasswordNotPrinted(assert, command, newPassword)

    const login = await client.post('/api/v1/auth/login').json({ email, password: newPassword })
    login.assertStatus(200)

    const oldLogin = await client.post('/api/v1/auth/login').json({ email, password })
    oldLogin.assertStatus(401)
    oldLogin.assertBody(unauthorized)

    const me = await client.get('/api/v1/me').header('cookie', cookie)
    me.assertStatus(401)
    me.assertBody(unauthorized)
  })

  test('finds the User however the email is typed', async ({ client }) => {
    const newPassword = 'a brand new passphrase'

    const command = await runWith('  Keeper@Example.COM ', newPassword, newPassword)

    command.assertSucceeded()
    const login = await client.post('/api/v1/auth/login').json({ email, password: newPassword })
    login.assertStatus(200)
  })

  test('uses the password exactly as typed, never trimmed', async ({ client }) => {
    const newPassword = ' padded passphrase '

    const command = await runWith(email, newPassword, newPassword)

    command.assertSucceeded()
    const exact = await client.post('/api/v1/auth/login').json({ email, password: newPassword })
    exact.assertStatus(200)
    const trimmed = await client
      .post('/api/v1/auth/login')
      .json({ email, password: newPassword.trim() })
    trimmed.assertStatus(401)
  })

  test('refuses an unknown email before any prompt', async ({ client, assert }) => {
    // No traps: a prompt would throw "untrapped prompt" into command.error.
    const command = await createCommand('nobody@example.com')

    await command.exec()

    command.assertFailed()
    assert.isUndefined(command.error)
    assert.isTrue(
      command.ui.logger.getLogs().some((log) => log.message.includes('No User with email'))
    )
    await assertUnchanged(client, cookie)
  })

  test('refuses a mismatched confirmation and changes nothing', async ({ client, assert }) => {
    const command = await runWith(email, 'a brand new passphrase', 'a brand new passphrasf')

    command.assertFailed()
    assertPasswordNotPrinted(assert, command, 'a brand new passphrase')
    await assertUnchanged(client, cookie)
  })

  test('refuses a password shorter than 12 characters', async ({ client }) => {
    const elevenCharacters = 'abcdefghijk'

    const command = await runWith(email, elevenCharacters, elevenCharacters)

    command.assertFailed()
    await assertUnchanged(client, cookie)
  })

  test('refuses a password longer than 256 characters', async ({ client }) => {
    const tooLong = 'x'.repeat(257)

    const command = await runWith(email, tooLong, tooLong)

    command.assertFailed()
    await assertUnchanged(client, cookie)
  })
})
