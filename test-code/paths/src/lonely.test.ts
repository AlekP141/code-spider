import { lonely } from "./lonely.js";

export function checkLonely(): boolean {
  return lonely() === "alone";
}
