jest.mock('../services/image-generation-job.service', () => ({
  createImageGenerationJob: jest.fn(),
  getImageGenerationJob: jest.fn(),
  kickImageGenerationWorker: jest.fn(),
}));

import express from 'express';
import { Types } from 'mongoose';
import {
  createAiImageGenerationJob,
  getAiImageGenerationJob,
} from '../controllers/upload.controller';
import {
  createImageGenerationJob,
  getImageGenerationJob,
  kickImageGenerationWorker,
} from '../services/image-generation-job.service';
import { AuthRequest } from '../types';

const response = () => {
  const res = {} as express.Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('image generation job controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 202 before the slow provider work starts', async () => {
    const userId = new Types.ObjectId();
    (createImageGenerationJob as jest.Mock).mockResolvedValue({ _id: 'job-1', status: 'queued' });
    const req = {
      user: { _id: userId, role: 'brand-admin' },
      body: { prompt: 'Premium desert safari', size: '1536x1024', quality: 'high', folder: 'ai-generated' },
    } as unknown as AuthRequest;
    const res = response();

    await createAiImageGenerationJob(req, res, jest.fn());

    expect(createImageGenerationJob).toHaveBeenCalledWith(userId, req.body);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(kickImageGenerationWorker).toHaveBeenCalled();
  });

  it('fails closed when another tenant user asks for a job they do not own', async () => {
    (getImageGenerationJob as jest.Mock).mockResolvedValue(null);
    const userId = new Types.ObjectId();
    const req = {
      user: { _id: userId, role: 'brand-admin' },
      params: { jobId: new Types.ObjectId().toString() },
    } as unknown as AuthRequest;
    const res = response();

    await getAiImageGenerationJob(req, res, jest.fn());

    expect(getImageGenerationJob).toHaveBeenCalledWith(req.params.jobId, userId);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(kickImageGenerationWorker).not.toHaveBeenCalled();
  });
});
