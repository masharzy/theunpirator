export class AppError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
export function notFound(message = "Resource not found") {
  return new AppError("NOT_FOUND", message, 404);
}
export function forbidden(message = "Forbidden") {
  return new AppError("FORBIDDEN", message, 403);
}
export function unauthorized(message = "Unauthorized") {
  return new AppError("UNAUTHORIZED", message, 401);
}
