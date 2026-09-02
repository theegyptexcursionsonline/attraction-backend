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
});
