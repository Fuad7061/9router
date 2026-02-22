import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/constants.js";

export class WhiskExecutor extends BaseExecutor {
  constructor() {
    super("whisk", PROVIDERS["whisk"]);
  }

  buildUrl(model, stream, urlIndex = 0) {
    // Whisk uses BatchExecute endpoint
    return "https://labs.google.com/_/VisualBlocksService/BatchExecute";
  }

  buildHeaders(credentials, stream = false) {
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Origin": "https://labs.google.com",
      "Referer": "https://labs.google.com/fx/tools/whisk/project"
    };

    // Prefer cookie if available, otherwise try to use access token
    if (credentials.cookie) {
      headers["Cookie"] = credentials.cookie;
    } else if (credentials.accessToken) {
      // Try using OAuth token (may not work for all Whisk endpoints)
      headers["Authorization"] = `Bearer ${credentials.accessToken}`;
    }

    return headers;
  }

  /**
   * Create a Whisk project
   * @param {object} credentials - Provider credentials
   * @param {string} projectName - Project name
   * @returns {Promise<string>} Project ID
   */
  async createProject(credentials, projectName = "9Router-Whisk-Project") {
    const payload = [
      [
        ["Iy0Ysb", JSON.stringify([null, projectName]), null, "generic"]
      ]
    ];

    const body = `f.req=${encodeURIComponent(JSON.stringify(payload))}`;

    const response = await fetch(this.buildUrl(), {
      method: "POST",
      headers: this.buildHeaders(credentials),
      body: body
    });

    if (!response.ok) {
      throw new Error(`Failed to create Whisk project: ${response.statusText}`);
    }

    const text = await response.text();
    return this.extractProjectId(text);
  }

  /**
   * Extract project ID from BatchExecute response
   * @param {string} responseText - Response text
   * @returns {string} Project ID
   */
  extractProjectId(responseText) {
    try {
      const lines = responseText.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parsed = JSON.parse(line);
        if (parsed && parsed[0] && parsed[0][2]) {
          const data = JSON.parse(parsed[0][2]);
          if (data && data[0]) {
            return data[0]; // Project ID
          }
        }
      }
    } catch (e) {
      throw new Error(`Failed to parse project ID: ${e.message}`);
    }
    throw new Error("Project ID not found in response");
  }

  /**
   * Generate image using Whisk API
   * @param {string} prompt - Text prompt for image generation
   * @param {object} credentials - Provider credentials
   * @param {string} aspectRatio - IMAGE_ASPECT_RATIO_SQUARE|LANDSCAPE|PORTRAIT
   * @param {number} seed - Random seed (0 for random)
   * @returns {Promise<object>} Image data with URL and base64
   */
  async generateImage(prompt, credentials, aspectRatio = "IMAGE_ASPECT_RATIO_LANDSCAPE", seed = 0) {
    try {
      // Get cookie - either from credentials or try to fetch with OAuth token
      let cookie = credentials.cookie;
      
      if (!cookie && credentials.accessToken) {
        // Try to get cookie using OAuth token
        cookie = await this.getCookieFromToken(credentials.accessToken);
      }

      if (!cookie) {
        throw new Error("No cookie available. Please re-authenticate or manually provide cookie.");
      }

      // Update credentials with cookie for subsequent calls
      const credsWithCookie = { ...credentials, cookie };

      // 1. Create project
      const projectId = await this.createProject(credsWithCookie, "9Router-Whisk-Project");

      // 2. Generate image
      const payload = [
        [
          ["GenerateImage", JSON.stringify([
            projectId,
            {
              prompt: prompt,
              aspectRatio: aspectRatio,
              seed: seed === 0 ? null : seed,
              model: "IMAGEN_3_5"
            }
          ]), null, "generic"]
        ]
      ];

      const body = `f.req=${encodeURIComponent(JSON.stringify(payload))}`;

      const response = await fetch(this.buildUrl(), {
        method: "POST",
        headers: this.buildHeaders(credsWithCookie),
        body: body
      });

      if (!response.ok) {
        throw new Error(`Image generation failed: ${response.statusText}`);
      }

      const text = await response.text();
      const imageData = this.parseImageResponse(text);

      return {
        mediaId: imageData.mediaId,
        imageUrl: imageData.imageUrl,
        base64Data: imageData.base64Data || null,
        prompt: prompt
      };
    } catch (error) {
      throw new Error(`Whisk generation failed: ${error.message}`);
    }
  }

  /**
   * Parse image response from BatchExecute
   * @param {string} responseText - Response text
   * @returns {object} Image data
   */
  parseImageResponse(responseText) {
    try {
      const lines = responseText.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const parsed = JSON.parse(line);
        if (parsed && parsed[0] && parsed[0][2]) {
          const data = JSON.parse(parsed[0][2]);
          if (data && data[1] && data[1][0]) {
            const imageData = data[1][0];
            return {
              mediaId: imageData[0] || null,
              imageUrl: imageData[1] || null,
              base64Data: imageData[2] || null
            };
          }
        }
      }
    } catch (e) {
      throw new Error(`Failed to parse image response: ${e.message}`);
    }
    throw new Error("Image data not found in response");
  }

  /**
   * Try to get Whisk cookie using OAuth access token
   * @param {string} accessToken - Google OAuth access token
   * @returns {Promise<string|null>} Cookie string or null
   */
  async getCookieFromToken(accessToken) {
    try {
      // Try to access Whisk with OAuth token and extract cookies
      const response = await fetch("https://labs.google.com/fx/tools/whisk/project", {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        },
        redirect: "manual"
      });

      // Extract cookies from response
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        return setCookie;
      }

      // If no cookies in response, try to get from request
      const cookies = response.headers.get("cookie");
      return cookies || null;
    } catch (error) {
      console.error("Failed to get cookie from token:", error.message);
      return null;
    }
  }

  /**
   * Refine/edit an existing image
   * @param {string} mediaId - ID of image to refine
   * @param {string} prompt - Edit instruction
   * @param {object} credentials - Provider credentials
   * @returns {Promise<object>} Refined image data
   */
  async refineImage(mediaId, prompt, credentials) {
    try {
      let cookie = credentials.cookie;
      if (!cookie && credentials.accessToken) {
        cookie = await this.getCookieFromToken(credentials.accessToken);
      }

      if (!cookie) {
        throw new Error("No cookie available for image refinement");
      }

      const credsWithCookie = { ...credentials, cookie };

      // Create project for refinement
      const projectId = await this.createProject(credsWithCookie, "9Router-Whisk-Refine");

      // Refine the image
      const payload = [
        [
          ["RefineImage", JSON.stringify([
            projectId,
            mediaId,
            {
              prompt: prompt,
              model: "IMAGEN_3_5"
            }
          ]), null, "generic"]
        ]
      ];

      const body = `f.req=${encodeURIComponent(JSON.stringify(payload))}`;

      const response = await fetch(this.buildUrl(), {
        method: "POST",
        headers: this.buildHeaders(credsWithCookie),
        body: body
      });

      if (!response.ok) {
        throw new Error(`Image refinement failed: ${response.statusText}`);
      }

      const text = await response.text();
      const imageData = this.parseImageResponse(text);

      return {
        mediaId: imageData.mediaId,
        imageUrl: imageData.imageUrl,
        base64Data: imageData.base64Data || null,
        prompt: prompt
      };
    } catch (error) {
      throw new Error(`Whisk refinement failed: ${error.message}`);
    }
  }

  /**
   * Animate image to video (requires LANDSCAPE aspect ratio)
   * @param {string} mediaId - ID of landscape image to animate
   * @param {string} script - Animation script/prompt
   * @param {object} credentials - Provider credentials
   * @returns {Promise<object>} Video data
   */
  async animateImage(mediaId, script, credentials) {
    try {
      let cookie = credentials.cookie;
      if (!cookie && credentials.accessToken) {
        cookie = await this.getCookieFromToken(credentials.accessToken);
      }

      if (!cookie) {
        throw new Error("No cookie available for animation");
      }

      const credsWithCookie = { ...credentials, cookie };

      // Create project for animation
      const projectId = await this.createProject(credsWithCookie, "9Router-Whisk-Animation");

      // Animate to video
      const payload = [
        [
          ["AnimateImage", JSON.stringify([
            projectId,
            mediaId,
            {
              script: script,
              model: "VEO_3_1_I2V_12STEP"
            }
          ]), null, "generic"]
        ]
      ];

      const body = `f.req=${encodeURIComponent(JSON.stringify(payload))}`;

      const response = await fetch(this.buildUrl(), {
        method: "POST",
        headers: this.buildHeaders(credsWithCookie),
        body: body
      });

      if (!response.ok) {
        throw new Error(`Animation failed: ${response.statusText}`);
      }

      const text = await response.text();
      const videoData = this.parseImageResponse(text); // Same format

      return {
        mediaId: videoData.mediaId,
        videoUrl: videoData.imageUrl, // URL field contains video URL
        prompt: script
      };
    } catch (error) {
      throw new Error(`Whisk animation failed: ${error.message}`);
    }
  }

  transformRequest(model, body, stream, credentials) {
    // Transform OpenAI DALL-E format to Whisk format
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
    // If we have a refresh token, use Google OAuth to refresh
    if (credentials.refreshToken) {
      try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { 
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json" 
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: credentials.refreshToken,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret
          })
        });

        if (!response.ok) {
          log?.error?.("TOKEN", "Whisk OAuth refresh failed");
          return null;
        }

        const tokens = await response.json();
        log?.info?.("TOKEN", "Whisk OAuth refreshed");

        // Try to get new cookie with refreshed token
        const newCookie = await this.getCookieFromToken(tokens.access_token);

        return {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || credentials.refreshToken,
          expiresIn: tokens.expires_in,
          cookie: newCookie || credentials.cookie, // Keep old cookie if can't get new one
          email: credentials.email
        };
      } catch (error) {
        log?.error?.("TOKEN", `Whisk refresh error: ${error.message}`);
        return null;
      }
    }

    // No refresh token available
    log?.warn?.("TOKEN", "Whisk: No refresh token, cannot auto-refresh");
    return null;
  }
}

export default WhiskExecutor;
