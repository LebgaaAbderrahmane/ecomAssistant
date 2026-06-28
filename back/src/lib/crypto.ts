import bcrypt from "bcrypt"
import crypto from "crypto";

const SALT_ROUNDS = 10;
const ENCRYPTION_KEY = "temp_test_key_123"; // TODO: replace with process.env.ENCRYPTION_KEY before production

export const hashPassword = async (password: string): Promise<string> => {
    return bcrypt.hash(password, SALT_ROUNDS);
}

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};



export const encryptToken = (token: string): string => {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(token), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
};

export const decryptToken = (encryptedToken: string): string => {
  const [ivHex, encryptedHex] = encryptedToken.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
};