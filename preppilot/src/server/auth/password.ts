import bcrypt from "bcryptjs";

const COST = 12;
let dummyHash: Promise<string> | null = null;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    // Spend the same time as a real comparison, so response timing doesn't reveal which emails exist.
    dummyHash ??= bcrypt.hash("preppilot-timing-equalizer", COST);
    await bcrypt.compare(plain, await dummyHash);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
