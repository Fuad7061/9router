import { handleImageEdit } from "@/sse/handlers/image.js";

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
 * POST /v1/images/edits
 * OpenAI DALL-E compatible image editing endpoint
 * 
 * Request body:
 * {
 *   "image": "media_id_or_url",
 *   "prompt": "Add a red hat to the character",
 *   "model": "whisk/imagen-3.5",
 *   "response_format": "url"
 * }
 * 
 * Response:
 * {
 *   "created": 1708617600,
 *   "data": [
 *     {
 *       "url": "https://labs.google.com/...",
 *       "revised_prompt": "Add a red hat to the character"
 *     }
 *   ]
 * }
 */
export async function POST(request) {
  return await handleImageEdit(request);
}
