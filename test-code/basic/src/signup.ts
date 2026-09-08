import type { UserInput, ValidUserData, User } from './types.js'

export function validateUser(input: UserInput): ValidUserData {
  if (!input.email) throw new Error('email required')
  return { ...input, verified: false }
}

export async function createUser(valid: ValidUserData): Promise<User> {
  return { ...valid, id: 'u_1' }
}

export async function sendWelcome(user: User): Promise<void> {
  console.log(`welcome ${user.name}`)
}

export async function handleSignup(input: UserInput): Promise<User> {
  const valid = validateUser(input)
  const user = await createUser(valid)
  await sendWelcome(user)
  return user
}

export const auditSignup = async (user: User): Promise<void> => {
  console.log(`audit ${user.id}`)
}
