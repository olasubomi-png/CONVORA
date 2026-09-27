import { getSession } from "@/lib/auth/session";
import { getActiveMembership } from "@/lib/authz/membership";
import { NotFoundError } from "@/lib/errors";
import { readMediaAssetBytes } from "@/lib/storage";

/**
 * Authorize read of a media asset. Public assets are open.
 * Private assets require active membership in the owning organization.
 */
export async function authorizeMediaRead(mediaId: string) {
  const asset = await readMediaAssetBytes(mediaId);
  if (asset.visibility === "public") {
    return asset;
  }
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
  return asset;
}
