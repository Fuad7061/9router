# Google Whisk Integration

## Overview

Google Whisk image generation provider integrated into 9Router with **Google OAuth authentication** and automatic cookie management.

## Features

✅ **Google OAuth Authentication** - No manual cookie extraction needed
✅ **Automatic Token Refresh** - OAuth tokens refresh automatically
✅ **Cookie Auto-Extraction** - Attempts to extract cookies from OAuth session
✅ **Fallback Support** - Works with OAuth tokens even if cookie extraction fails
✅ **Text-to-Image Generation** - IMAGEN 3.5 model
✅ **Image Editing/Refinement** - Edit existing images
✅ **OpenAI DALL-E Compatible** - Drop-in replacement API
✅ **Multiple Images** - Generate up to 10 images per request
✅ **3 Aspect Ratios** - Square, landscape, portrait

## Authentication

Whisk uses **Google OAuth** (same as Gemini CLI and Antigravity):

1. Go to Dashboard → Providers → Add Provider → Whisk
2. Click "Connect with Google"
3. Authorize with your Google account
4. Done! OAuth tokens refresh automatically

### How It Works

1. **OAuth Flow**: User authenticates with Google OAuth
2. **Token Storage**: Access token and refresh token are stored
3. **Cookie Extraction**: System attempts to extract Whisk cookies from OAuth session
4. **Automatic Refresh**: When access token expires, it refreshes automatically
5. **Cookie Update**: New cookies are extracted on each token refresh

### Fallback Mechanism

If cookie extraction fails, the system will:
1. Try to use OAuth access token directly (may have limited functionality)
2. Prompt user to re-authenticate if both methods fail

## API Usage

### Text-to-Image Generation

**Endpoint**: `POST /v1/images/generations`

```bash
curl -X POST http://localhost:20128/v1/images/generations \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "whisk/imagen-3.5",
    "prompt": "A futuristic cyberpunk city at sunset",
    "n": 1,
    "size": "1024x1024",
    "response_format": "url"
  }'
```

**Parameters**:
- `model` (string, required): `whisk/imagen-3.5`
- `prompt` (string, required): Text description
- `n` (integer, optional): Number of images (1-10, default: 1)
- `size` (string, optional): `1024x1024` (square), `1792x1024` (landscape), `1024x1792` (portrait)
- `response_format` (string, optional): `url` or `b64_json`
- `seed` (integer, optional): Random seed for reproducibility

**Response**:
```json
{
  "created": 1708617600,
  "data": [
    {
      "url": "https://labs.google.com/...",
      "revised_prompt": "A futuristic cyberpunk city at sunset"
    }
  ]
}
```

### Image Editing

**Endpoint**: `POST /v1/images/edits`

```bash
curl -X POST http://localhost:20128/v1/images/edits \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "whisk/imagen-3.5",
    "image": "media_id_from_previous_generation",
    "prompt": "Add a red sports car in the foreground"
  }'
```

## Integration Examples

### Node.js

```javascript
const response = await fetch('http://localhost:20128/v1/images/generations', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'whisk/imagen-3.5',
    prompt: 'A beautiful sunset over the ocean',
    n: 1,
    size: '1024x1024'
  })
});

const data = await response.json();
console.log('Image URL:', data.data[0].url);
```

### Python

```python
import requests

response = requests.post(
    'http://localhost:20128/v1/images/generations',
    headers={'Authorization': 'Bearer your-api-key'},
    json={
        'model': 'whisk/imagen-3.5',
        'prompt': 'A majestic dragon flying over mountains',
        'size': 'landscape'
    }
)

data = response.json()
print('Image URL:', data['data'][0]['url'])
```

### OpenAI SDK (Drop-in Replacement)

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:20128/v1',
  apiKey: 'your-api-key'
});

const image = await openai.images.generate({
  model: 'whisk/imagen-3.5',
  prompt: 'A cute robot playing guitar',
  size: '1024x1024'
});

console.log(image.data[0].url);
```

## Advantages Over Cookie-Based Auth

| Feature | OAuth (New) | Cookie-Only (Old) |
|---------|-------------|-------------------|
| Setup | One-click OAuth | Manual cookie extraction |
| Expiration | Auto-refresh (never expires) | Manual refresh every 30 days |
| Security | Secure OAuth flow | Cookie exposure risk |
| User Experience | Seamless | Manual maintenance |
| Multi-Account | Easy switching | Manual cookie management |

## Troubleshooting

### "No credentials for provider: whisk"
**Solution**: Authenticate via Dashboard → Providers → Whisk → Connect with Google

### "Invalid Whisk credentials"
**Solution**: Re-authenticate via OAuth. Your tokens may have expired or been revoked.

### "Whisk generation failed"
**Possible causes**:
1. Cookie extraction failed - System will retry on next token refresh
2. Rate limiting - Wait a few minutes and try again
3. Invalid prompt - Check prompt content

### OAuth Token Refresh Failed
**Solution**: 
1. Go to Dashboard → Providers → Whisk
2. Click "Reconnect"
3. Authorize again with Google

## Technical Details

### Architecture

```
User → OAuth Flow → Google → Access Token + Refresh Token
                                    ↓
                            Cookie Extraction (best effort)
                                    ↓
                            Whisk API (via @rohitaryal/whisk-api)
                                    ↓
                            Image Generation
```

### Token Lifecycle

1. **Initial Auth**: User authorizes via Google OAuth
2. **Token Storage**: Access token (1h) + Refresh token (long-lived)
3. **Cookie Extraction**: Attempt to get Whisk cookies from OAuth session
4. **Auto Refresh**: When access token expires, refresh automatically
5. **Cookie Update**: Extract new cookies on each refresh

### Fallback Strategy

1. **Primary**: Use extracted cookie with Whisk API
2. **Secondary**: Use OAuth access token directly (limited functionality)
3. **Tertiary**: Prompt user to re-authenticate

## Comparison with Other Providers

Whisk follows the same OAuth pattern as:
- **Gemini CLI** - Google OAuth with project ID extraction
- **Antigravity** - Google OAuth with Cloud Code API
- **Claude** - Anthropic OAuth with PKCE
- **Codex** - OpenAI OAuth with PKCE

## Limitations

1. **Cookie Extraction**: May not always succeed (Google's internal API)
2. **Image URLs**: Temporary URLs that expire after ~24 hours
3. **Rate Limits**: Subject to Google's usage limits
4. **VPN**: May be required in some countries

## Future Enhancements

- [ ] Image-to-Video endpoint (`/v1/videos/animations`)
- [ ] Improved cookie extraction reliability
- [ ] Image hosting integration for permanent URLs
- [ ] Batch generation optimization
- [ ] Usage analytics per account

## Dependencies

- `@rohitaryal/whisk-api` - Unofficial Whisk API wrapper

## License

MIT License - Same as 9Router
