import bcrypt from "bcrypt";

export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const hashOTP = (otp: string) => bcrypt.hash(otp, 10);
export const compareOTP = (otp: string, hash: string) => bcrypt.compare(otp, hash);