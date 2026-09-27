import { NextResponse } from "next/server";
import { readMediaAssetBytes } from "@/lib/storage";
import { getSession } from "@/lib/auth/session";
import { getActiveMembership } from "@/lib/authz/membership";
import { NotFoundError } from "@/lib/errors";
import { jsonError } from "@/lib/api/response";

type Params = { params: Promise<{ mediaId: string }> };

/**
 * Serve media bytes. Public assets are open; private require org membership.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { mediaId } = await params;
    const asset = await readMediaAssetBytes(mediaId);

    if (asset.visibility !== "public") {
      const session = await getSession();
      if (!session?.user?.id || !asset.organizationId) {
        throw new NotFoundError("Media not found.");
      }
      const membership = await getActiveMembership(
        session.user.id,
        asset.organizationId,
      );
      if (!membership) {
        throw new NotFoundError("Media not found.");
      }
    }

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
