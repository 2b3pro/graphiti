/**
 * Shared generateResponse() implementation — wraps generateText() with structured output,
 * language instructions, and input cleaning.
 *
 * Port of Python's LLMClient.generate_response() base class method.
 */

import type { GenerateResponseOptions, LLMClient } from '../contracts';
import type { Message } from '../prompts/types';
import { getExtractionLanguageInstruction } from './language';

const ZERO_WIDTH_CHARS = /[\u200b\u200c\u200d\ufeff\u2060]/g;
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/**
 * Clean input string of invalid unicode and control characters.
 * Port of Python's LLMClient._clean_input().
 */
export function cleanInput(text: string): string {
  // Clean any invalid Unicode (JS handles this via TextEncoder/Decoder)
  let cleaned = text;

  // Remove zero-width characters and other invisible unicode
  cleaned = cleaned.replace(ZERO_WIDTH_CHARS, '');

  // Remove control characters except newlines, returns, and tabs
  cleaned = cleaned.replace(CONTROL_CHARS, '');

  return cleaned;
}

/**
 * Default implementation of generateResponse() that wraps generateText().
 * This is called by all LLM client implementations.
 */
export async function generateResponse(
  client: LLMClient,
  messages: Message[],
  options: GenerateResponseOptions = {}
): Promise<Record<string, unknown>> {
  // Deep clone messages to avoid mutating the caller's array
  const processedMessages = messages.map((m) => ({ ...m }));

  // Append JSON schema to last user message if response_model provided
  if (options.response_model) {
    const serializedModel = JSON.stringify(options.response_model);
    const lastMessage = processedMessages[processedMessages.length - 1];
    if (lastMessage) {
      lastMessage.content += `\n\nRespond with a JSON object in the following format:\n\n${serializedModel}`;
    }
  }

  // Add multilingual extraction instructions to system message
  const languageInstruction = getExtractionLanguageInstruction(options.group_id);
  if (processedMessages.length > 0 && languageInstruction) {
    processedMessages[0]!.content += languageInstruction;
  }

  // Clean all message inputs
  for (const message of processedMessages) {
    message.content = cleanInput(message.content);
  }

  // Generate text response
  const responseText = await client.generateText(processedMessages);

  // Parse JSON response
  try {
    // Try to extract JSON from the response (handles markdown code blocks)
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonText = jsonMatch ? jsonMatch[1]!.trim() : responseText.trim();
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    // If JSON parsing fails, try to find a JSON object in the response
    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]) as Record<string, unknown>;
      } catch {
        // Fall through to error
      }
    }
    throw new Error(
      `Failed to parse LLM response as JSON. Raw output (first 500 chars): ${responseText.slice(0, 500)}`
    );
  }
}
