import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/constants.js";

export class WhiskExecutor extends BaseExecutor {
  constructor() {
    super("whisk", PROVIDERS["whisk"]);
  }

  buildUrl(model, stream, urlIndex = 0) {
    // Whisk uses BatchExecute endpoint
    return this.config.baseUrl;
  }

  buildHeaders(credentials, stream = false) {
    const headers = {
      ...this.config.headers
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
   * Generate image using Whisk API
   * @param {string} prompt - Text prompt for image generation
   * @param {object} credentials - Provider credentials with cookie or accessToken
   * @param {string} aspectRatio - IMAGE_ASPECT_RATIO_SQUARE|LANDSCAPE|PORTRAIT
   * @param {number} seed - Random seed (0 for random)
   * @returns {Promise<object>} Image data with URL and base64
   */
  async generateImage(prompt, credentials, aspectRatio = "IMAGE_ASPECT_RATIO_LANDSCAPE", seed = 0) {
    try {
      // Dynamically import whisk-api
      const { Whisk } = await import("@rohitaryal/whisk-api");
      
      // Get cookie - either from credentials or try to fetch with OAuth token
      let cookie = credentials.cookie;
      
      if (!cookie && credentials.accessToken) {
        // Try to get cookie using OAuth token
        cookie = await this.getCookieFromToken(credentials.accessToken);
      }

      if (!cookie) {
        throw new Error("No cookie available. Please re-authenticate or manually provide cookie.");
      }
      
      const whisk = new Whisk(cookie);
      
      // Create temporary project
      const project = await whisk.newProject("9Router-Whisk-Project");
      
      // Generate image with specified parameters
      const media = await project.generateImage({
        prompt: prompt,
        aspectRatio: aspectRatio,
        seed: seed === 0 ? undefined : seed,
        model: "IMAGEN_3_5"
      });
      
      // Return standardized response
      return {
        mediaId: media.id,
        imageUrl: media.url,
        base64Data: media.base64 || null,
        prompt: prompt
      };
    } catch (error) {
      throw new Error(`Whisk generation failed: ${error.message}`);
    }
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
      const { Whisk } = await import("@rohitaryal/whisk-api");
      
      let cookie = credentials.cookie;
      if (!cookie && credentials.accessToken) {
        cookie = await this.getCookieFromToken(credentials.accessToken);
      }

      if (!cookie) {
        throw new Error("No cookie available for image refinement");
      }
      
      const whisk = new Whisk(cookie);
      const project = await whisk.newProject("9Router-Whisk-Refine");
      
      // Fetch the original media
      const originalMedia = await whisk.fetchMedia(mediaId);
      
      // Refine the image
      const refinedMedia = await originalMedia.refine(prompt);
      
      return {
        mediaId: refinedMedia.id,
        imageUrl: refinedMedia.url,
        base64Data: refinedMedia.base64 || null,
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
      const { Whisk } = await import("@rohitaryal/whisk-api");
      
      let cookie = credentials.cookie;
      if (!cookie && credentials.accessToken) {
        cookie = await this.getCookieFromToken(credentials.accessToken);
      }

      if (!cookie) {
        throw new Error("No cookie available for animation");
      }
      
      const whisk = new Whisk(cookie);
      
      // Fetch the original media
      const originalMedia = await whisk.fetchMedia(mediaId);
      
      // Animate to video
      const video = await originalMedia.animate(script, "VEO_3_1_I2V_12STEP");
      
      return {
        mediaId: video.id,
        videoUrl: video.url,
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
