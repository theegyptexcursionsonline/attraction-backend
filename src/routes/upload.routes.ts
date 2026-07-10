import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { uploadSingleImage, uploadMultipleImages, generateAiImage } from '../controllers/upload.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { cleanupUploadedFiles } from '../utils/uploadCleanup';

const router = Router();

// Configure multer for temporary file storage
const storage = multer.diskStorage({
  destination: '/tmp/uploads',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export const runUpload = (middleware: ReturnType<typeof upload.single>) =>
  (req: AuthRequest, res: Parameters<typeof middleware>[1], next: Parameters<typeof middleware>[2]): void => {
    middleware(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      void cleanupUploadedFiles(req).then(() => next(error));
    });
  };

router.post(
  '/image',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager', 'editor'),
  runUpload(upload.single('image')),
  uploadSingleImage
);

router.post(
  '/images',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager', 'editor'),
  runUpload(upload.array('images', 10)),
  uploadMultipleImages
);

router.post(
  '/generate',
  authenticate,
  requireRole('super-admin', 'brand-admin', 'manager', 'editor'),
  generateAiImage
);

export default router;
