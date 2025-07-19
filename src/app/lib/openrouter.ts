import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";

// Types for OpenRouter API
interface OpenRouterContentPartText {
  type: "text";
  text: string;
  cache_control?: {
    type: "ephemeral";
  };
}

interface OpenRouterContentPartImage {
  type: "image_url";
  image_url: {
    url: string;
  };
}

type OpenRouterContentPart =
  | OpenRouterContentPartText
  | OpenRouterContentPartImage;

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: OpenRouterContentPart[];
}

interface OpenRouterOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

// Interface for streaming response data
interface StreamResponseData {
  choices: Array<{
    delta: {
      content?: string;
    };
  }>;
}

// Create a shared OpenAI client instance for connection reuse
let sharedClient: OpenAI | null = null;

function getSharedClient(): OpenAI {
  if (!sharedClient) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not set in environment variables");
    }

    sharedClient = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "Search AI",
      },
      // Optimize for concurrent requests
      maxRetries: 3,
      timeout: 60000, // 60 second timeout
    });
  }
  return sharedClient;
}

/**
 * Sleep function for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on certain error types
      if (
        error instanceof Error &&
        (error.message.includes("content_filter") ||
          error.message.includes("invalid_request") ||
          error.message.includes("authentication"))
      ) {
        throw error;
      }

      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(
        `🔄 Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay...`
      );
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Validates image URLs and checks if they're accessible
 */
async function validateImageUrls(imageUrls: string[]): Promise<string[]> {
  const validUrls: string[] = [];

  for (const url of imageUrls) {
    try {
      // Try to fetch the image headers to check if it exists and is accessible
      const response = await fetch(url, { method: "HEAD" });
      if (
        response.ok &&
        response.headers.get("content-type")?.startsWith("image/")
      ) {
        validUrls.push(url);
      } else {
        console.error(`❌ Invalid image URL or not an image: ${url}`);
        console.error(
          `   Status: ${response.status}, Content-Type: ${response.headers.get("content-type")}`
        );
      }
    } catch (error) {
      console.error(`❌ Error validating image URL: ${url}`);
      console.error("   Error:", error);
    }
  }

  return validUrls;
}

/**
 * Makes an API call to OpenRouter using Gemini models
 * @param systemPrompt - The system prompt
 * @param query - The processed query string
 * @param imageUrls - Optional array of image URLs to process
 * @returns The model's response text
 */
export async function getAIResponse(
  systemPrompt: string,
  query: string,
  imageUrls?: string[]
): Promise<string> {
  const client = getSharedClient();

  try {
    // Create system message with conditional cache control for Gemini
    const systemContent: OpenRouterContentPartText = {
      type: "text",
      text: systemPrompt,
    };

    // Only add cache control for Gemini model with images
    if (imageUrls?.length) {
      systemContent.cache_control = {
        type: "ephemeral",
      };
    }

    const messages: OpenRouterMessage[] = [
      {
        role: "system",
        content: [systemContent],
      },
    ];

    // If image URLs are provided, validate them first
    if (imageUrls && imageUrls.length > 0) {
      console.log(`🔍 Validating ${imageUrls.length} image URLs...`);
      const validUrls = await validateImageUrls(imageUrls);

      if (validUrls.length === 0) {
        throw new Error("No valid image URLs found");
      }

      console.log(`✅ Found ${validUrls.length} valid images`);

      const userContent: OpenRouterContentPart[] = [
        {
          type: "text",
          text: query,
        },
        ...validUrls.map(
          (url): OpenRouterContentPartImage => ({
            type: "image_url",
            image_url: { url },
          })
        ),
      ];
      messages.push({
        role: "user",
        content: userContent,
      });
    } else {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: query,
          },
        ],
      });
    }

    async function tryModel(
      model: string,
      isGemini = false
    ): Promise<ChatCompletion> {
      // Remove cache control if not using Gemini
      if (!isGemini && systemContent?.cache_control) {
        delete systemContent.cache_control;
      }

      try {
        const response = await client.chat.completions.create({
          model: model,
          messages:
            messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
          temperature: 0.7,
          max_tokens: 500,
        });
        return response;
      } catch (error) {
        throw error;
      }
    }

    // Try with primary model first (Gemini Flash 1.5)
    console.log(`📤 Sending request to OpenRouter with Gemini Flash 1.5...`);
    let completion;
    try {
      completion = await withRetry(() =>
        tryModel("google/gemini-flash-1.5", true)
      );

      // If content filter triggered, try fallback model
      if (completion.choices[0]?.finish_reason === "content_filter") {
        console.warn(
          "Content filter triggered with Gemini, trying alternative models..."
        );
        completion = await withRetry(() =>
          tryModel("openai/gpt-4o-mini", false)
        );
      }
    } catch (primaryError) {
      console.error("Gemini model failed, trying alternative models...");
      console.error(primaryError);

      // Try fallback model
      completion = await withRetry(() => tryModel("openai/gpt-4o-mini", false));
    }

    console.log("OpenRouter response:", completion);

    // Check for content filter response on fallback model
    if (completion.choices[0]?.finish_reason === "content_filter") {
      console.warn(
        "Content filter triggered on both models, using fallback description"
      );
      return "";
    }

    const response = completion.choices[0]?.message?.content ?? "";
    if (!response) {
      console.error(
        "❌ OpenRouter returned empty response. Full response:",
        completion
      );
      return "";
    }

    return response;
  } catch (error) {
    console.error("❌ Error calling OpenRouter API:", error);
    if (error instanceof Error) {
      console.error("   Error details:", {
        message: error.message,
        stack: error.stack,
      });
    }
    // Return fallback description instead of throwing
    return "";
  }
}

export class OpenRouter {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = "https://openrouter.ai/api/v1";
  }

  private async makeRequest(
    messages: OpenRouterMessage[],
    options: OpenRouterOptions = {}
  ): Promise<Response> {
    const body = {
      model: options.model ?? "google/gemini-pro-vision",
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 500,
      stream: options.stream ?? false,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    return response;
  }

  async chat(
    messages: OpenRouterMessage[],
    options: OpenRouterOptions = {}
  ): Promise<string> {
    const response = await this.makeRequest(messages, options);
    if (!response.body) {
      throw new Error("No response body received");
    }
    const responseBody = (await response.json()) as ChatCompletion;
    return responseBody.choices[0]?.message.content ?? "";
  }

  async chatStream(
    messages: OpenRouterMessage[],
    options: OpenRouterOptions = {}
  ): Promise<ReadableStream<string>> {
    const response = await this.makeRequest(messages, {
      ...options,
      stream: true,
    });
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get response reader");
    }

    return new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.trim() === "") continue;
              if (line === "data: [DONE]") continue;

              try {
                const data = JSON.parse(
                  line.startsWith("data: ") ? line.slice(6) : line
                ) as StreamResponseData; // Using the new interface

                const content = data.choices[0]?.delta.content ?? "";
                if (content) {
                  controller.enqueue(content);
                }
              } catch (error) {
                console.error("Error parsing stream data:", error);
              }
            }
          }
        } catch (error) {
          console.error("Error reading stream:", error);
          controller.error(error);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });
  }

  async generateImage(
    prompt: string,
    imageUrls: string[] = []
  ): Promise<string> {
    const messages: OpenRouterMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          ...imageUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ],
      },
    ];

    const response = await this.chat(messages, {
      model: "anthropic/claude-3-opus-20240229",
      temperature: 0.7,
      max_tokens: 4096,
    });

    return response;
  }
}
