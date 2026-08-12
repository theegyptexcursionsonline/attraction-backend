import { Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';
import { uploadImage } from '../services/upload.service';
import { cleanupUploadedFiles } from '../utils/uploadCleanup';
import {
  createImageGenerationJob,
  getImageGenerationJob,
  kickImageGenerationWorker,
} from '../services/image-generation-job.service';

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

export const createAiImageGenerationJob = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'Authentication required', 401);
      return;
    }
    const job = await createImageGenerationJob(req.user._id, req.body);
    sendSuccess(res, { id: String(job._id), status: job.status }, 'Image generation queued', 202);
    kickImageGenerationWorker();
  } catch (error) {
    next(error);
  }
};

export const getAiImageGenerationJob = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'Authentication required', 401);
      return;
    }
    const ownerScope = req.user.role === 'super-admin' ? undefined : req.user._id;
    const job = await getImageGenerationJob(req.params.jobId, ownerScope);
    if (!job) {
      sendError(res, 'Image generation job not found', 404);
      return;
    }
    kickImageGenerationWorker();
    sendSuccess(res, {
      id: String(job._id),
      status: job.status,
      error: job.status === 'failed' ? job.error : undefined,
      result: job.status === 'succeeded' ? job.result : undefined,
    });
  } catch (error) {
    next(error);
  }
};
