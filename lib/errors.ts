export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "CONFIGURATION_ERROR"
  | "INTERNAL_ERROR";

export type AppErrorOptions = {
  cause?: unknown;
  details?: Record<string, unknown>;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;
  readonly expose: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    message: string,
    statusCode: number,
    expose: boolean,
    options?: AppErrorOptions,
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.expose = expose;
    this.details = options?.details;
  }
}

export class ValidationError extends AppError {
  constructor(message = "The request is invalid.", options?: AppErrorOptions) {
    super("VALIDATION_ERROR", message, 400, true, options);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication is required.", options?: AppErrorOptions) {
    super("AUTHENTICATION_ERROR", message, 401, true, options);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action.", options?: AppErrorOptions) {
    super("AUTHORIZATION_ERROR", message, 403, true, options);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.", options?: AppErrorOptions) {
    super("NOT_FOUND", message, 404, true, options);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "The request conflicts with existing state.", options?: AppErrorOptions) {
    super("CONFLICT", message, 409, true, options);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Try again later.", options?: AppErrorOptions) {
    super("RATE_LIMIT", message, 429, true, options);
    this.name = "RateLimitError";
  }
}

export class InternalError extends AppError {
  constructor(message = "An unexpected error occurred.", options?: AppErrorOptions) {
    super("INTERNAL_ERROR", message, 500, false, options);
    this.name = "InternalError";
  }
}

export type PublicErrorPayload = {
  error: {
    code: AppErrorCode;
    message: string;
  };
};

/**
 * Convert any thrown value into a client-safe payload.
 * Internal details, stack traces, and database errors are never returned.
 */
export function toPublicError(error: unknown): {
  statusCode: number;
  payload: PublicErrorPayload;
} {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      payload: {
        error: {
          code: error.code,
          message: error.expose ? error.message : "An unexpected error occurred.",
        },
      },
    };
  }

  return {
    statusCode: 500,
    payload: {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    },
  };
}


export class ConfigurationError extends AppError {
  constructor(message = "A required configuration is missing.", options?: AppErrorOptions) {
    super("CONFIGURATION_ERROR", message, 503, true, options);
    this.name = "ConfigurationError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
