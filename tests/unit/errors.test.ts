import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  InternalError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  isAppError,
  toPublicError,
} from "@/lib/errors";

describe("application errors", () => {
  it("exposes safe messages for client-facing errors", () => {
    const error = new ValidationError("Email is required.");
    const publicError = toPublicError(error);

    expect(error.expose).toBe(true);
    expect(publicError.statusCode).toBe(400);
    expect(publicError.payload.error.code).toBe("VALIDATION_ERROR");
    expect(publicError.payload.error.message).toBe("Email is required.");
  });

  it("hides internal error details from clients", () => {
    const error = new InternalError("relation organizations does not exist", {
      cause: new Error("pg detail"),
    });
    const publicError = toPublicError(error);

    expect(error.expose).toBe(false);
    expect(publicError.statusCode).toBe(500);
    expect(publicError.payload.error.message).toBe("An unexpected error occurred.");
    expect(publicError.payload.error.message).not.toContain("organizations");
  });

  it("maps unknown throws to an internal error", () => {
    const publicError = toPublicError(new Error("ECONNREFUSED 127.0.0.1:5432"));

    expect(publicError.statusCode).toBe(500);
    expect(publicError.payload.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(publicError.payload)).not.toContain("ECONNREFUSED");
  });

  it("assigns expected status codes", () => {
    expect(new AuthenticationError().statusCode).toBe(401);
    expect(new AuthorizationError().statusCode).toBe(403);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError().statusCode).toBe(409);
    expect(new RateLimitError().statusCode).toBe(429);
  });

  it("identifies AppError instances", () => {
    expect(isAppError(new NotFoundError())).toBe(true);
    expect(isAppError(new Error("plain"))).toBe(false);
  });
});
