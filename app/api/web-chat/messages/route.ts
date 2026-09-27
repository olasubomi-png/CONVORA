import {
  sendVisitorMessage,
  listVisitorMessages,
} from "@/lib/web-chat/visitor";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";
import { AuthorizationError } from "@/lib/errors";

function sessionFromRequest(request: Request): string {
  const header = request.headers.get("x-convora-visitor-token");
  if (!header) throw new AuthorizationError("Visitor session is required.");
  return header;
}

const postSchema = z
  .object({
    body: z.string().trim().max(4000).optional().default(""),
    clientMessageId: z.string().uuid().optional(),
    mediaId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.body?.trim()) || Boolean(v.mediaId), {
    message: "Message must include text and/or an image.",
  });

export async function GET(request: Request) {
  try {
    const token = sessionFromRequest(request);
    const afterId = new URL(request.url).searchParams.get("after") ?? undefined;
    const result = await listVisitorMessages(token, { afterId });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const token = sessionFromRequest(request);
    const body = await request.json();
    const input = parseInput(postSchema, body);
    const message = await sendVisitorMessage(
      token,
      input.body ?? "",
      input.clientMessageId,
      input.mediaId,
    );
    return jsonOk(
      {
        message: {
          id: message.id,
          body: message.body,
          role: "visitor",
          createdAt: message.createdAt,
          attachments: input.mediaId
            ? [
                {
                  mediaUrl: `/api/media/${input.mediaId}`,
                },
              ]
            : [],
        },
      },
      201,
    );
  } catch (error) {
    return jsonError(error);
  }
}
