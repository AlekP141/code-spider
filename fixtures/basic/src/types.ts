export type UserInput = { email: string; name: string }
export type ValidUserData = UserInput & { verified: boolean }
export type User = ValidUserData & { id: string }
