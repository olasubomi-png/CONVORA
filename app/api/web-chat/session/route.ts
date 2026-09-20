import { createOrResumeVisitorSession } from "@/lib/web-chat/visitor";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";

const bodySchema = z.object({
  publicKey: z.string().min(8).max(80),
  sessionToken: z.string().min(16).max(200).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseInput(bodySchema, body);
    const origin = request.headers.get("origin");
    const result = await createOrResumeVisitorSession({
      publicKey: input.publicKey,
      origin,
      sessionToken: input.sessionToken,
    });
    return jsonOk({
      sessionToken: result.sessionToken,
      config: {
        displayName: result.config.displayName ?? result.installation.name,
        welcomeMessage:
          result.config.welcomeMessage ?? "Hi! How can we help?",
        launcherPosition: result.config.launcherPosition ?? "bottom-right",
        accentColor: result.config.accentColor ?? "#1f4e3d",
        headerText: result.config.headerText ?? result.installation.name,
      },
      conversationId: result.visitor.conversationId,
    });
  } catch (error) {
    return jsonError(error);
  }
}
