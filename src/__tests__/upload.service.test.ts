jest.mock('../config/env', () => ({
  env: {
    cloudinaryCloudName: 'demo',
    cloudinaryApiKey: 'test-key',
    cloudinaryApiSecret: 'test-secret',
  },
}));

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload: jest.fn(), destroy: jest.fn() },
    url: jest.fn(),
  },
}));

import { v2 as cloudinary } from 'cloudinary';
import { uploadBase64Image } from '../services/upload.service';

describe('uploadBase64Image', () => {
  beforeEach(() => { jest.clearAllMocks(); (cloudinary.uploader.upload as jest.Mock).mockResolvedValue({ secure_url: 'https://res.cloudinary.com/demo/image.jpg', public_id: 'asset' }); });
  it('uses a stable public id and overwrite controls for retry-safe imports', async () => {
    (cloudinary.uploader.upload as jest.Mock).mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/demo/image/upload/gallery-02.jpg',
      public_id: 'attractions-network/tours/makadi/gallery-02',
      width: 1200,
      height: 800,
    });

    await uploadBase64Image('data:image/jpeg;base64,abc', 'tours/makadi', {
      publicId: 'gallery-02',
      overwrite: true,
    });

    expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
      'data:image/jpeg;base64,abc',
      expect.objectContaining({
        folder: 'attractions-network/tours/makadi',
        public_id: 'gallery-02',
        overwrite: true,
        invalidate: true,
      }),
    );
  });
  it('keeps existing default 1200 by 800 limit and upload transformations', async () => {
    await uploadBase64Image('data:image/jpeg;base64,abc');
    expect(cloudinary.uploader.upload).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ transformation: [{ width: 1200, height: 800, crop: 'limit' }, { quality: 'auto:good' }, { fetch_format: 'auto' }] }));
  });
  it('preserves the generated 1536 by 1024 raster when requested', async () => {
    await uploadBase64Image('data:image/jpeg;base64,abc', 'tours/grand-rock-safari/generated', { maxWidth: 1536, maxHeight: 1024, overwrite: false, publicId: 'hero' });
    expect(cloudinary.uploader.upload).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ overwrite: false, invalidate: false, transformation: expect.arrayContaining([{ width: 1536, height: 1024, crop: 'limit' }]) }));
  });
  it.each([0, -1, 1537, 1.5, Infinity, NaN, null])('refuses invalid dimension %s without provider calls', async value => {
    await expect(uploadBase64Image('data:image/jpeg;base64,abc', 'tours', { maxWidth: value as number })).rejects.toThrow('dimensions');
    await expect(uploadBase64Image('data:image/jpeg;base64,abc', 'tours', { maxHeight: value as number })).rejects.toThrow('dimensions');
    expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
  });
});
