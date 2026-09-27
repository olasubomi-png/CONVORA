import { NextResponse } from "next/server";
import { authorizeMediaRead } from "@/lib/media/access";
import { jsonError } from "@/lib/api/response";

type Params = { params: Promise<{ mediaId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { mediaId } = await params;
    const asset = await authorizeMediaRead(mediaId);

    return new NextResponse(new Uint8Array(asset.bytes), {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control":
          asset.visibility === "public"
            ? "public, max-age=86400"
            : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
