import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  followConversation,
  unfollowConversation,
  listWatchers,
} from "@/lib/conversations/watchers";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    const watchers = await listWatchers(auth.user.id, id);
    return jsonOk({ watchers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    const watcher = await followConversation(auth.user.id, id);
    return jsonOk({ watcher }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    await unfollowConversation(auth.user.id, id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
