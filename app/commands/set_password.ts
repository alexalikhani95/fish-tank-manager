import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import hash from '@adonisjs/core/services/hash'
import { User } from '#models/user'
import { emailRule, passwordRule } from '#validators/auth_validator'

/**
 * Resets a forgotten password from the server. Asks for the new password
 * twice at a hidden prompt and signs out every device.
 */
export default class SetPassword extends BaseCommand {
  static commandName = 'user:set-password'
  static description = "Set a User's password and sign out every device"

  // Boots the app: the command needs Mongo and the hash service.
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Email of the User' })
  declare email: string

  async run() {
    // Normalised like the API's, so `Me@Example.com ` finds `me@example.com`.
    const email = emailRule.safeParse(this.email)
    const user = email.success ? await User.findOne({ email: email.data }) : null
    if (!user) {
      this.logger.error(`No User with email "${this.email}"`)
      this.exitCode = 1
      return
    }

    // Used exactly as typed: never trimmed, like the API.
    const password = await this.prompt.secure('New password')
    const confirmation = await this.prompt.secure('Confirm password')
    if (password !== confirmation) {
      this.logger.error('Passwords do not match. Nothing changed.')
      this.exitCode = 1
      return
    }
    if (!passwordRule.safeParse(password).success) {
      this.logger.error('Password must be 12 to 256 characters. Nothing changed.')
      this.exitCode = 1
      return
    }

    // Bumping tokenVersion makes every token signed before now a 401.
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await hash.make(password) }, $inc: { tokenVersion: 1 } }
    )
    this.logger.success(`Password set for ${user.email}. Every device is signed out.`)
  }
}
