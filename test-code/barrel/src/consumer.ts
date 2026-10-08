import { add } from './inner/index.js'

export function total(values: number[]): number {
  return values.reduce((acc, v) => add(acc, v), 0)
}
