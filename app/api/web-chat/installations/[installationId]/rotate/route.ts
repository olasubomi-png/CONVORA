import { requireAuthenticatedUser } from "@/lib/authz/context";
import { rotateInstallationPublicKey } from "@/lib/web-chat/installations";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ installationId: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { installationId } = await params;
    const installation = await rotateInstallationPublicKey(
      auth.user.id,
      installationId,
    );
    return jsonOk({ installation });
  } catch (error) {
    return jsonError(error);
  }
}
