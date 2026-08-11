jest.mock('../config/env', () => ({
  env: { openaiApiKey: 'test-openai-key' },
}));

import { generateImageFromPrompt } from '../services/image-generation.service';

describe('image generation service', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('uses the approved image model and returns the generated payload', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'encoded-image' }] }),
    } as Response);

    await expect(generateImageFromPrompt({ prompt: 'Sunrise safari' })).resolves.toEqual({
      base64: 'encoded-image',
      mimeType: 'image/jpeg',
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'gpt-image-1.5',
      size: '1536x1024',
      quality: 'high',
      output_format: 'jpeg',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts a stalled provider call with a useful retry message', async () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'fetch').mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      })
    );

    const result = generateImageFromPrompt({ prompt: 'Stalled request' });
    const rejection = expect(result).rejects.toThrow('Image generation timed out. Please try again.');
    await jest.advanceTimersByTimeAsync(150_000);
    await rejection;
  });
});
