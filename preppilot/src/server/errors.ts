/** Errors that are safe to show to the user. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const forbidden = () => new AppError(403, "FORBIDDEN", "You don't have access to this.");
export const unauthorized = () => new AppError(401, "UNAUTHORIZED", "Please sign in.");
export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details);
export const conflict = (message: string) => new AppError(409, "CONFLICT", message);
export const tooMany = () => new AppError(429, "RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
