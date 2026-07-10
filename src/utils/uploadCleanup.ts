import { promises as fs } from 'fs';
import { AuthRequest } from '../types';

const uploadedFiles = (req: AuthRequest): Express.Multer.File[] => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') {
    return Object.values(req.files).flat();
  }
  return [];
};

export const cleanupUploadedFiles = async (req: AuthRequest): Promise<void> => {
  await Promise.all(
    uploadedFiles(req).map(async (file) => {
      if (!file.path) return;
      try {
        await fs.unlink(file.path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error('[upload] failed to remove temporary file');
        }
      }
    })
  );
};
