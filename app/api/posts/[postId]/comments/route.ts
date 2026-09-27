import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { addComment, listComments } from "@/lib/posts/social";
import { jsonError } from "@/lib/api/response";
import { ValidationError } from "@/lib/errors";

type Params = { params: Promise<{ postId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { postId } = await params;
    const comments = await listComments(postId);
    return NextResponse.json({
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        authorName: c.authorName,
        userId: c.userId,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { postId } = await params;
    const body = (await request.json()) as { body?: string };
    if (!body.body) throw new ValidationError("body is required.");
    const comment = await addComment(auth.user.id, postId, body.body);
    return NextResponse.json({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
