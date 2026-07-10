import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import request from 'supertest';
import { Readable } from 'stream';
import { uploadMultipleImages, uploadSingleImage } from '../controllers/upload.controller';
import { runUpload } from '../routes/upload.routes';
import { uploadImage } from '../services/upload.service';
import { AuthRequest } from '../types';

jest.mock('../services/upload.service', () => ({
  uploadImage: jest.fn(),
  uploadBase64Image: jest.fn(),
}));
jest.mock('../services/image-generation.service', () => ({ generateImageFromPrompt: jest.fn() }));

const makeResponse = () => {
  const res = {} as express.Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const tempFile = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-cleanup-'));
  const file = path.join(directory, 'image.jpg');
  fs.writeFileSync(file, 'image');
  return file;
};

const multerFile = (filePath: string): Express.Multer.File => ({
  fieldname: 'image',
  originalname: 'image.jpg',
  encoding: '7bit',
  mimetype: 'image/jpeg',
  size: 5,
  destination: path.dirname(filePath),
  filename: path.basename(filePath),
  path: filePath,
  buffer: Buffer.alloc(0),
  stream: Readable.from([]),
});

describe('upload temp-file cleanup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('unlinks a single temp file after a successful upload', async () => {
    const filePath = tempFile();
    (uploadImage as jest.Mock).mockResolvedValue({ url: 'https://cdn.test/a', publicId: 'a' });
    const req = { file: multerFile(filePath) } as AuthRequest;

    await uploadSingleImage(req, makeResponse(), jest.fn());

    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('unlinks every batch temp file when one upload fails', async () => {
    const first = tempFile();
    const second = tempFile();
    (uploadImage as jest.Mock)
      .mockResolvedValueOnce({ url: 'https://cdn.test/a', publicId: 'a' })
      .mockRejectedValueOnce(new Error('cloud upload failed'));
    const next = jest.fn();
    const req = { files: [multerFile(first), multerFile(second)] } as unknown as AuthRequest;

    await uploadMultipleImages(req, makeResponse(), next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(fs.existsSync(first)).toBe(false);
    expect(fs.existsSync(second)).toBe(false);
  });

  it('unlinks files already written when multer fails partway through a batch', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'multer-cleanup-'));
    const upload = multer({
      dest: directory,
      fileFilter: (_req, file, callback) => {
        if (file.originalname === 'bad.txt') {
          callback(new Error('invalid file'));
          return;
        }
        callback(null, true);
      },
    });
    const app = express();
    app.post('/upload', runUpload(upload.array('images', 10)), (_req, res) => res.sendStatus(204));
    app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.sendStatus(400);
    });

    await request(app)
      .post('/upload')
      .attach('images', Buffer.from('first'), 'good.jpg')
      .attach('images', Buffer.from('second'), 'bad.txt')
      .expect(400);

    expect(fs.readdirSync(directory)).toEqual([]);
  });
});
