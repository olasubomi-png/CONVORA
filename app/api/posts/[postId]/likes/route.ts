import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { likePost, unlikePost } from "@/lib/posts/social";
import { jsonError } from "@/lib/api/response";

type Params = { params: Promise<{ postId: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { postId } = await params;
    const engagement = await likePost(auth.user.id, postId);
    return NextResponse.json(engagement);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { postId } = await params;
    const engagement = await unlikePost(auth.user.id, postId);
    return NextResponse.json(engagement);
  } catch (error) {
    return jsonError(error);
  }
}
