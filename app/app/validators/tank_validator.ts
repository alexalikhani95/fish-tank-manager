import vine from '@vinejs/vine'

/**
 * Volume is always litres here. The client converts from the User's preferred
 * unit before submitting — the API only ever stores canonical units
 * (docs/design/hld.md → Units).
 */
export const createTankValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(80),
    volumeLitres: vine.number().positive(),
  })
)

export const updateTankValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(80).optional(),
    volumeLitres: vine.number().positive().optional(),
  })
)
