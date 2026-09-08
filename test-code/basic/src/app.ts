import { handleSignup } from './signup.js'
import type { UserInput, User } from './types.js'

export async function main(input: UserInput): Promise<User> {
  return handleSignup(input)
}

export async function retry(input: UserInput): Promise<User> {
  return handleSignup(input)
}
