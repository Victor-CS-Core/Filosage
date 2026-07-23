import OpenAI from "openai";

export class ContentSafetyError extends Error {
  constructor(message = "We can’t process this request. Revise it to focus on safe, lawful learning.") {
    super(message);
    this.name = "ContentSafetyError";
  }
}

export async function assertSafeContent(client: OpenAI, input: string) {
  const moderation = await client.moderations.create({ model: "omni-moderation-latest", input });
  if (moderation.results.some((result) => result.flagged)) throw new ContentSafetyError();
}
