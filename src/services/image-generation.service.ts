import { env } from '../config/env';

export type GeneratedImageSize = '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
export type GeneratedImageQuality = 'low' | 'medium' | 'high' | 'auto';
export type GeneratedImageFormat = 'png' | 'webp' | 'jpeg';

interface GenerateImageParams {
  prompt: string;
  size?: GeneratedImageSize;
  quality?: GeneratedImageQuality;
  outputFormat?: GeneratedImageFormat;
}

interface OpenAiImageGenerationResponse {
  data?: Array<{
    b64_json?: string;
  }>;
  error?: {
    message?: string;
  };
}

const buildImagePrompt = (prompt: string): string => {
  const normalizedPrompt = prompt.trim();

  return [
    normalizedPrompt,
    'Create a realistic, premium travel marketing image.',
    'No text, no logos, no watermark, no collage, no split panels.',
    'Natural lighting, polished composition, photorealistic detail, destination-focused framing.',
  ].join(' ');
};

export const generateImageFromPrompt = async ({
  prompt,
  size = '1536x1024',
  quality = 'high',
  outputFormat = 'jpeg',
}: GenerateImageParams): Promise<{
  base64: string;
  mimeType: string;
}> => {
  if (!env.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150_000);
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1.5',
        prompt: buildImagePrompt(prompt),
        size,
        quality,
        output_format: outputFormat,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Image generation timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json()) as OpenAiImageGenerationResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || 'OpenAI image generation failed');
  }

  const base64 = payload.data?.[0]?.b64_json;
  if (!base64) {
    throw new Error('OpenAI did not return image data');
  }

  const mimeType = outputFormat === 'png' ? 'image/png' : outputFormat === 'webp' ? 'image/webp' : 'image/jpeg';

  return {
    base64,
    mimeType,
  };
};
