import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';

// Configure Cloudinary
if (env.cloudinaryCloudName) {
  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
  });
}

interface UploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
}

interface Base64UploadOptions {
  /** Stable asset name for retry-safe operational imports. */
  publicId?: string;
  /** Replace the same stable asset instead of creating a duplicate. */
  overwrite?: boolean;
}

export const uploadImage = async (
  filePath: string,
  folder: string = 'attractions'
): Promise<UploadResult> => {
  if (!env.cloudinaryCloudName) {
    throw new Error('Cloudinary not configured');
  }

  const result = await cloudinary.uploader.upload(filePath, {
    folder: `attractions-network/${folder}`,
    transformation: [
      { width: 1200, height: 800, crop: 'limit' },
      { quality: 'auto:good' },
      { fetch_format: 'auto' },
    ],
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
  };
};

export const uploadBase64Image = async (
  base64Data: string,
  folder: string = 'attractions',
  options: Base64UploadOptions = {}
): Promise<UploadResult> => {
  if (!env.cloudinaryCloudName) {
    throw new Error('Cloudinary not configured');
  }

  const result = await cloudinary.uploader.upload(base64Data, {
    folder: `attractions-network/${folder}`,
    ...(options.publicId ? {
      public_id: options.publicId,
      overwrite: options.overwrite ?? false,
      invalidate: Boolean(options.overwrite),
    } : {}),
    transformation: [
      { width: 1200, height: 800, crop: 'limit' },
      { quality: 'auto:good' },
      { fetch_format: 'auto' },
    ],
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
  };
};

export const deleteImage = async (publicId: string): Promise<void> => {
  if (!env.cloudinaryCloudName) {
    throw new Error('Cloudinary not configured');
  }

  await cloudinary.uploader.destroy(publicId);
};

export const getOptimizedUrl = (
  publicId: string,
  options: { width?: number; height?: number } = {}
): string => {
  if (!env.cloudinaryCloudName) {
    return '';
  }

  return cloudinary.url(publicId, {
    transformation: [
      { width: options.width || 800, height: options.height || 600, crop: 'fill' },
      { quality: 'auto:good' },
      { fetch_format: 'auto' },
    ],
  });
};
