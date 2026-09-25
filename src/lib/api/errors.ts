/** Errors that route handlers translate into specific HTTP responses. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class AuthenticationRequiredError extends ApiError {
  constructor() {
    super(401, "Authentication required", "AUTHENTICATION_REQUIRED");
    this.name = "AuthenticationRequiredError";
  }
}
