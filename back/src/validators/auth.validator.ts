import { z } from "zod";

export const signupSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email address"),

  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .regex(/[0-9]/, "Password must contain at least one number"),

  shopName: z
    .string({ required_error: "Shop name is required" })
    .min(2, "Shop name must be at least 2 characters")
    .max(64, "Shop name must be at most 64 characters"),
});

export const verifyEmailSchema = z.object({
  token: z
    .string({ required_error: "Verification token is required" })
    .min(1, "Token cannot be empty"),
});

// Inferred types — useful in controller/service if needed
export type SignupInput = z.infer<typeof signupSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;