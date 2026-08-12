jest.mock('../models/ImageGenerationJob', () => ({
  ImageGenerationJob: {
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));
jest.mock('../services/image-generation.service', () => ({ generateImageFromPrompt: jest.fn() }));
jest.mock('../services/upload.service', () => ({ uploadBase64Image: jest.fn() }));

import { ImageGenerationJob } from '../models/ImageGenerationJob';
import { generateImageFromPrompt } from '../services/image-generation.service';
import { uploadBase64Image } from '../services/upload.service';
import { processNextImageGenerationJob } from '../services/image-generation-job.service';

describe('durable image generation worker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('atomically claims, generates, uploads, and completes one queued job', async () => {
    (ImageGenerationJob.findOneAndUpdate as jest.Mock).mockResolvedValue({
      _id: 'job-1',
      prompt: 'Premium desert safari',
      size: '1536x1024',
      quality: 'high',
      folder: 'attractions/ai-generated',
    });
    (generateImageFromPrompt as jest.Mock).mockResolvedValue({ base64: 'image-bytes', mimeType: 'image/jpeg' });
    (uploadBase64Image as jest.Mock).mockResolvedValue({
      url: 'https://cdn.example/generated.jpg',
      publicId: 'attractions-network/attractions/ai-generated/job-1',
      width: 1200,
      height: 800,
    });
    (ImageGenerationJob.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(processNextImageGenerationJob()).resolves.toBe(true);
    expect(ImageGenerationJob.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: { $lt: 3 } }),
      expect.objectContaining({ $inc: { attempts: 1 } }),
      expect.objectContaining({ new: true })
    );
    expect(generateImageFromPrompt).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Premium desert safari',
      outputFormat: 'jpeg',
    }));
    expect(ImageGenerationJob.updateOne).toHaveBeenCalledWith(
      { _id: 'job-1', status: 'processing' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'succeeded' }) })
    );
  });

  it('records a bounded failure instead of leaving the job processing forever', async () => {
    (ImageGenerationJob.findOneAndUpdate as jest.Mock).mockResolvedValue({
      _id: 'job-2',
      prompt: 'Premium desert safari',
      size: '1536x1024',
      quality: 'high',
      folder: 'attractions/ai-generated',
    });
    (generateImageFromPrompt as jest.Mock).mockRejectedValue(new Error('Provider unavailable'));
    (ImageGenerationJob.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

    await expect(processNextImageGenerationJob()).resolves.toBe(true);
    expect(uploadBase64Image).not.toHaveBeenCalled();
    expect(ImageGenerationJob.updateOne).toHaveBeenCalledWith(
      { _id: 'job-2', status: 'processing' },
      expect.objectContaining({ $set: { status: 'failed', error: 'Provider unavailable' } })
    );
  });
});
