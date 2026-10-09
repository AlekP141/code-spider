import { join } from "node:path";
import Mocha from "mocha";

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "bdd", color: true, timeout: 120_000 });
  mocha.addFile(join(__dirname, "extension.smoke.cjs"));
  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) reject(new Error(`${failures} smoke test(s) failed`));
      else resolve();
    });
  });
}
