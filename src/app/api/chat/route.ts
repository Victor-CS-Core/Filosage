import OpenAI from "openai";
import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import { tutorInputSchema, validationMessage } from "@/lib/validation";

const model = process.env.OPENAI_MODEL || "gpt-5.6";

export async function POST(request: Request) {
  try {
    await requireOwner(request);
    const parsed = tutorInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { error: validationMessage(parsed.error) },
        { status: 400 },
      );
    }

    const { messages, data } = parsed.data;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await client.responses.create({
      model,
      instructions: `You are a concise, encouraging AI tutor for ${data.topic}. The learner is studying "${data.lessonTitle}" with a focus on "${data.lessonConcept}". Ground every answer in the supplied lesson content. Use guided questions and small hints before giving a direct answer. Never claim to have capabilities beyond this lesson.\n\nLESSON CONTENT\n${data.lessonContent}`,
      input: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      stream: true,
      max_output_tokens: 1_500,
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "response.output_text.delta") {
              controller.enqueue(encoder.encode(event.delta));
            }
          }
          controller.close();
        } catch (error) {
          console.error("Tutor stream failed:", error);
          controller.error(error);
        }
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Tutor request failed:", error);
    return Response.json({ error: "The tutor is temporarily unavailable." }, { status: 500 });
  }
}
