import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export async function POST(req: Request) {
  const { messages, data } = await req.json();

  const topic = data?.topic || "Unknown Topic";
  const lessonTitle = data?.lessonTitle || "Unknown Lesson";
  const lessonConcept = data?.lessonConcept || "Unknown Concept";

  const systemPrompt = `You are a helpful AI Tutor. You are teaching the user about "${data.topic}".
Currently, the user is taking a lesson on "${data.lessonTitle}" focusing on the concept of "${data.lessonConcept}".
    
Below is the reading material the user is currently reading. Answer any questions they have based on this material, and keep your answers concise and encouraging.
    
--- READING MATERIAL ---
${data.lessonContent || "No reading material provided."}
------------------------

Your goal is to guide the user to understand this concept using the Zone of Proximal Development philosophy.
- Do not just give away the answer.
- Ask questions to test their understanding.
- Keep your responses concise and conversational.
- Be encouraging.`;

  const result = await streamText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    messages,
  });

  return result.toTextStreamResponse();
}
