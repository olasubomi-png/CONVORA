import { NextResponse } from "next/server";
import { toPublicError } from "@/lib/errors";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown) {
  const publicError = toPublicError(error);
  return NextResponse.json(publicError.payload, {
    status: publicError.statusCode,
  });
}
