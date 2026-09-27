import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authorizeMediaRead } from "@/lib/media/access";
import { jsonError } from "@/lib/api/response";

type Params = { params: Promise<{ mediaId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { mediaId } = await params;
    const headerToken = request.headers.get("x-convora-visitor-token");
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get("convora_wc_token")?.value ?? null;
    const visitorToken = headerToken || cookieToken;
    const asset = await authorizeMediaRead(mediaId, { visitorToken });

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
