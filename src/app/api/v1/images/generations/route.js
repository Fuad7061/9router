import { handleImageGeneration } from "@/sse/handlers/image.js";

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    }
  });
}

/**
 * POST /v1/images/generations
 * OpenAI DALL-E compatible image generation endpoint
 * 
 * Request body:
 * {
 *   "prompt": "A futuristic city at sunset",
 *   "model": "whisk/imagen-3.5",
 *   "n": 1,
 *   "size": "1024x1024",
 *   "response_format": "url",
 *   "seed": 0
 * }
 * 
 * Response:
 * {
 *   "created": 1708617600,
 *   "data": [
 *     {
 *       "url": "https://labs.google.com/...",
 *       "revised_prompt": "A futuristic city at sunset"
 *     }
 *   ]
 * }
 */
export async function POST(request) {
  return await handleImageGeneration(request);
}
