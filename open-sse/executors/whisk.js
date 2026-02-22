import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/constants.js";

export class WhiskExecutor extends BaseExecutor {
  constructor() {
    super("whisk", PROVIDERS["whisk"]);
  }

  buildUrl() {
    return "https://labs.google.com/_/VisualBlocksService/BatchExecute";
  }

  buildHeaders(credentials) {
    if (!credentials || !credentials.cookie) {
      throw new Error("Whisk authentication requires a 'cookie' string.");
    }
    return {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Origin": "https://labs.google.com",
      "Referer": "https://labs.google.com/fx/tools/whisk/project",
      "Cookie": credentials.cookie,
    };
  }

  async createProject(credentials, projectName = "9Router-Whisk-Project") {
    const payload = [[["Iy0Ysb", JSON.stringify([null, projectName]), null, "generic"]]];
    const body = `f.req=${encodeURIComponent(JSON.stringify(payload))}`;
    const response = await fetch(this.buildUrl(), { method: "POST", headers: this.buildHeaders(credentials), body });
    if (!response.ok) throw new Error(`Failed to create Whisk project: ${response.statusText}`);
    const text = await response.text();
    return this.extractProjectId(text);
  }

  extractProjectId(responseText) {
    try {
      const lines = responseText.split('\n').filter(line => line.trim().length > 5);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        if (parsed && parsed[0] && parsed[0][2]) {
          const data = JSON.parse(parsed[0][2]);
          if (data && data[0]) return data[0];
        }
      }
    } catch (e) { /* Silently ignore parsing errors */ }
    throw new Error("Could not extract Project ID from Whisk response.");
  }

  async generateImage(prompt, credentials, aspectRatio = "IMAGE_ASPECT_RATIO_LANDSCAPE", seed = 0) {
    const projectId = await this.createProject(credentials);
    const payload = [[["GenerateImage", JSON.stringify([{ prompt, aspectRatio, seed: seed === 0 ? null : seed, model: "IMAGEN_3_5" }]), projectId, "generic"]]];
    const body = `f.req=${encodeURIComponent(JSON.stringify(payload))}`;
    const response = await fetch(this.buildUrl(), { method: "POST", headers: this.buildHeaders(credentials), body });
    if (!response.ok) throw new Error(`Image generation failed: ${response.statusText}`);
    const text = await response.text();
    const imageData = this.parseImageResponse(text);
    return { mediaId: imageData.mediaId, imageUrl: imageData.imageUrl, base64Data: imageData.base64Data, prompt };
  }

  parseImageResponse(responseText) {
    try {
      const lines = responseText.split('\n').filter(line => line.trim().length > 5);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        if (parsed && parsed[0] && parsed[0][2]) {
          const data = JSON.parse(parsed[0][2]);
          if (data && data[1] && data[1][0]) {
            const imageData = data[1][0];
            return { mediaId: imageData[0] || null, imageUrl: imageData[1] || null, base64Data: imageData[2] || null };
          }
        }
      }
    } catch (e) { /* Silently ignore parsing errors */ }
    throw new Error("Could not parse image data from Whisk response.");
  }
  
  transformRequest(model, body) {
    return {
      prompt: body.prompt,
      aspectRatio: this.mapSizeToAspectRatio(body.size || "1024x1024"),
      seed: body.seed || 0,
      n: body.n || 1,
      responseFormat: body.response_format || "url"
    };
  }

  mapSizeToAspectRatio(size) {
    const sizeMap = {
      "1024x1024": "IMAGE_ASPECT_RATIO_SQUARE",
      "1792x1024": "IMAGE_ASPECT_RATIO_LANDSCAPE",
      "1024x1792": "IMAGE_ASPECT_RATIO_PORTRAIT",
      "square": "IMAGE_ASPECT_RATIO_SQUARE",
      "landscape": "IMAGE_ASPECT_RATIO_LANDSCAPE",
      "portrait": "IMAGE_ASPECT_RATIO_PORTRAIT"
    };
    return sizeMap[size] || "IMAGE_ASPECT_RATIO_LANDSCAPE";
  }

  async refreshCredentials(credentials, log) {
    log?.warn?.("TOKEN", "Whisk uses manual cookie authentication and cannot be auto-refreshed.");
    return null;
  }
}

export default WhiskExecutor;
