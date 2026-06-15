import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

/**
 * Generic validation middleware factory.
 * Pass a Zod schema and the source to validate ("body" | "query" | "params").
 *
 * Usage:
 *   router.post("/signup", validate(signupSchema, "body"), signupController)
 *   router.get("/verify-email", validate(verifyEmailSchema, "query"), verifyEmailController)
 */
export function validate(
  schema: ZodSchema,
  source: "body" | "query" | "params" = "body"
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const errors = result.error.errors.map((e: ZodError["errors"][number]) => ({
        field: e.path.join("."),
        message: e.message,
      }));

      return res.status(400).json({
        message: "Validation failed",
        errors,
      });
    }

    // Attach parsed (and type-safe) data back onto req
    req[source] = result.data;
    next();
  };
}