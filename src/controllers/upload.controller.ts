import { Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';
import { uploadImage } from '../services/upload.service';
import { uploadBase64Image } from '../services/upload.service';
import { generateImageFromPrompt } from '../services/image-generation.service';
import { cleanupUploadedFiles } from '../utils/uploadCleanup';

export const uploadSingleImage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.file) {
      sendError(res, 'No file uploaded', 400);
      return;
    }

    const result = await uploadImage(req.file.path);

    sendSuccess(res, {
      url: result.url,
      publicId: result.publicId,
      width: result.width,
      height: result.height,
    }, 'Image uploaded successfully');
  } catch (error) {
    next(error);
  } finally {
    await cleanupUploadedFiles(req);
  }
};

export const uploadMultipleImages = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      sendError(res, 'No files uploaded', 400);
      return;
    }

    const results = await Promise.all(
      files.map((file) => uploadImage(file.path))
    );

    sendSuccess(res, results.map((r) => ({
      url: r.url,
      publicId: r.publicId,
      width: r.width,
      height: r.height,
    })), 'Images uploaded successfully');
  } catch (error) {
    next(error);
  } finally {
    await cleanupUploadedFiles(req);
  }
};

export const generateAiImage = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const size = typeof req.body?.size === 'string' ? req.body.size : '1536x1024';
    const quality = typeof req.body?.quality === 'string' ? req.body.quality : 'high';
    const folder = typeof req.body?.folder === 'string' && req.body.folder.trim()
      ? req.body.folder.trim()
      : 'ai-generated';

    if (!prompt) {
      sendError(res, 'Prompt is required', 400);
      return;
    }

    const generated = await generateImageFromPrompt({
      prompt,
      size,
      quality,
      outputFormat: 'jpeg',
    });

    const uploaded = await uploadBase64Image(
      `data:${generated.mimeType};base64,${generated.base64}`,
      folder
    );

    sendSuccess(res, {
      url: uploaded.url,
      publicId: uploaded.publicId,
      width: uploaded.width,
      height: uploaded.height,
      prompt,
    }, 'Image generated successfully');
  } catch (error) {
    next(error);
  }
};
