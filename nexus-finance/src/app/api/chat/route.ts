import { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getClient, MODEL, SYSTEM_PROMPT, TOOLS, executeTool, buildContext } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOOL_ROUNDS = 6;

/**
 * Streams newline-delimited JSON events:
 *   {type:"text", text}   — assistant text delta
 *   {type:"tool", name}   — a tool is being executed (UI hint)
 *   {type:"done"}         — turn complete
 *   {type:"error", error} — something broke
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const history: { role: "user" | "assistant"; content: string }[] = body.messages ?? [];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        const client = getClient();
        const context = await buildContext();

        const messages: Anthropic.MessageParam[] = history.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const msgStream = client.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            system: [
              { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
              { type: "text", text: `<context>\n${context}\n</context>` },
            ],
            tools: TOOLS,
            messages,
          });

          msgStream.on("text", (delta) => send({ type: "text", text: delta }));

          const final = await msgStream.finalMessage();

          if (final.stop_reason !== "tool_use") break;

          messages.push({ role: "assistant", content: final.content });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type !== "tool_use") continue;
            send({ type: "tool", name: block.name });
            const result = await executeTool(block.name, block.input);
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
          }
          messages.push({ role: "user", content: toolResults });
        }

        send({ type: "done" });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
