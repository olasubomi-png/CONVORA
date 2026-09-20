import { requireVisitorSession, listVisitorMessages } from "@/lib/web-chat/visitor";
import { AuthorizationError } from "@/lib/errors";
import { jsonError } from "@/lib/api/response";

/**
 * SSE stream for visitor: polls for new messages every 2s.
 * HTTP POST for visitor→server; SSE for server→visitor.
 */
export async function GET(request: Request) {
  try {
    const token = request.headers.get("x-convora-visitor-token");
    if (!token) throw new AuthorizationError("Visitor session is required.");
    await requireVisitorSession(token);

    const encoder = new TextEncoder();
    let lastIds = new Set<string>();
    let closed = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        send("ready", { ok: true });

        while (!closed) {
          try {
            const result = await listVisitorMessages(token);
            const newOnes = result.messages.filter((m) => !lastIds.has(m.id));
            for (const m of newOnes) {
              send("message", m);
              lastIds.add(m.id);
            }
            // Cap memory of seen ids
            if (lastIds.size > 500) {
              lastIds = new Set(result.messages.map((m) => m.id));
            }
          } catch {
            send("error", { message: "sync_failed" });
          }
          await new Promise((r) => setTimeout(r, 2000));
          if (request.signal.aborted) {
            closed = true;
            break;
          }
        }
        controller.close();
      },
      cancel() {
        closed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
