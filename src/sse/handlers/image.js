import { getProviderCredentials, extractApiKey, isValidApiKey } from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import { errorResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/constants.js";
import * as log from "../utils/logger.js";
import { WhiskExecutor } from "open-sse/executors/whisk.js";

/**
 * Handle image generation request
 * OpenAI DALL-E compatible endpoint: POST /v1/images/generations
 */
export async function handleImageGeneration(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    log.warn("IMAGE", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const { 
    prompt, 
    model = "whisk/imagen-3.5", 
    n = 1, 
    size = "1024x1024", 
    response_format = "url",
    seed = 0
  } = body;

  if (!prompt) {
    log.warn("IMAGE", "Missing prompt");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required parameter: prompt");
  }

  // Validate n parameter
  if (n < 1 || n > 10) {
    log.warn("IMAGE", `Invalid n parameter: ${n}`);
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Parameter 'n' must be between 1 and 10");
  }

  log.request("POST", `/v1/images/generations | ${model} | n=${n} | size=${size} | prompt: ${prompt.substring(0, 50)}...`);

  // Enforce API key if enabled
  const settings = await getSettings();
  const apiKey = extractApiKey(request);
  
  if (settings.requireApiKey) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
  }

  // Parse provider and model
  const [provider, modelName] = model.includes("/") ? model.split("/") : ["whisk", model];

  if (provider !== "whisk") {
    log.warn("IMAGE", `Unsupported provider: ${provider}`);
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `Only 'whisk' provider is supported for image generation`);
  }

  // Get credentials
  const credentials = await getProviderCredentials(provider);
  if (!credentials) {
    log.error("AUTH", `No credentials for provider: ${provider}`);
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}. Please authenticate via OAuth in dashboard.`);
  }

  // Check if we have either cookie or access token
  if (!credentials.cookie && !credentials.accessToken) {
    log.error("AUTH", "Whisk credentials missing both cookie and access token");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid Whisk credentials. Please re-authenticate via OAuth.");
  }

  // Generate images
  const executor = new WhiskExecutor();
  const images = [];
  const startTime = Date.now();

  try {
    for (let i = 0; i < n; i++) {
      log.info("IMAGE", `Generating image ${i + 1}/${n}...`);
      
      const result = await executor.generateImage(
        prompt,
        credentials,
        executor.mapSizeToAspectRatio(size),
        seed
      );

      if (response_format === "b64_json") {
        if (!result.base64Data) {
          log.warn("IMAGE", "Base64 data not available, falling back to URL");
          images.push({
            url: result.imageUrl,
            revised_prompt: prompt
          });
        } else {
          images.push({
            b64_json: result.base64Data,
            revised_prompt: prompt
          });
        }
      } else {
        images.push({
          url: result.imageUrl,
          revised_prompt: prompt
        });
      }

      log.success("IMAGE", `Image ${i + 1}/${n} generated (${result.mediaId})`);
    }

    const duration = Date.now() - startTime;
    log.success("IMAGE", `Generated ${n} image(s) in ${duration}ms`);

    return new Response(JSON.stringify({
      created: Math.floor(Date.now() / 1000),
      data: images
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    log.error("IMAGE", `Generation failed: ${error.message}`);
    
    // Check for cookie expiration
    if (error.message.includes("401") || error.message.includes("unauthorized") || error.message.includes("cookie")) {
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Whisk cookie expired or invalid. Please update cookie in dashboard.");
    }
    
    return errorResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, `Image generation failed: ${error.message}`);
  }
}

/**
 * Handle image editing/refinement request
 * OpenAI DALL-E compatible endpoint: POST /v1/images/edits
 */
export async function handleImageEdit(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    log.warn("IMAGE", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const { 
    image, // Media ID or URL
    prompt, 
    model = "whisk/imagen-3.5",
    response_format = "url"
  } = body;

  if (!image || !prompt) {
    log.warn("IMAGE", "Missing image or prompt");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required parameters: image and prompt");
  }

  log.request("POST", `/v1/images/edits | ${model} | image: ${image} | prompt: ${prompt.substring(0, 50)}...`);

  // Enforce API key if enabled
  const settings = await getSettings();
  const apiKey = extractApiKey(request);
  
  if (settings.requireApiKey) {
    if (!apiKey) {
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
  }

  // Parse provider
  const [provider] = model.includes("/") ? model.split("/") : ["whisk", model];

  if (provider !== "whisk") {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `Only 'whisk' provider is supported`);
  }

  // Get credentials
  const credentials = await getProviderCredentials(provider);
  if (!credentials || !credentials.cookie) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
  }

  // Refine image
  const executor = new WhiskExecutor();

  try {
    log.info("IMAGE", "Refining image...");
    
    const result = await executor.refineImage(image, prompt, credentials);

    log.success("IMAGE", `Image refined (${result.mediaId})`);

    const imageData = response_format === "b64_json" && result.base64Data
      ? { b64_json: result.base64Data, revised_prompt: prompt }
      : { url: result.imageUrl, revised_prompt: prompt };

    return new Response(JSON.stringify({
      created: Math.floor(Date.now() / 1000),
      data: [imageData]
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (error) {
    log.error("IMAGE", `Refinement failed: ${error.message}`);
    
    if (error.message.includes("401") || error.message.includes("unauthorized")) {
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Whisk cookie expired or invalid");
    }
    
    return errorResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, `Image refinement failed: ${error.message}`);
  }
}
