import { Types } from 'mongoose';
import { ImageGenerationJob, IImageGenerationJob } from '../models/ImageGenerationJob';
import { generateImageFromPrompt } from './image-generation.service';
import { uploadBase64Image } from './upload.service';

const LEASE_MS = 4 * 60 * 1000;
const WORKER_INTERVAL_MS = 2_000;
let workerPromise: Promise<void> | null = null;

const safeError = (error: unknown): string =>
  (error instanceof Error ? error.message : 'Image generation failed').slice(0, 500);

export const createImageGenerationJob = async (
  requestedBy: Types.ObjectId,
  input: {
    prompt: string;
    size: IImageGenerationJob['size'];
    quality: IImageGenerationJob['quality'];
    folder: string;
  }
): Promise<IImageGenerationJob> => ImageGenerationJob.create({ requestedBy, ...input });

export const getImageGenerationJob = async (
  jobId: string,
  requestedBy?: Types.ObjectId
): Promise<IImageGenerationJob | null> => {
  const query: Record<string, unknown> = { _id: jobId };
  if (requestedBy) query.requestedBy = requestedBy;
  return ImageGenerationJob.findOne(query);
};

export const processNextImageGenerationJob = async (): Promise<boolean> => {
  const now = new Date();
  const job = await ImageGenerationJob.findOneAndUpdate(
    {
      $or: [
        { status: 'queued' },
        { status: 'processing', leaseExpiresAt: { $lt: now } },
      ],
      attempts: { $lt: 3 },
    },
    {
      $set: { status: 'processing', leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
      $inc: { attempts: 1 },
      $unset: { error: 1 },
    },
    { new: true, sort: { createdAt: 1 } }
  );

  if (!job) return false;

  try {
    const generated = await generateImageFromPrompt({
      prompt: job.prompt,
      size: job.size,
      quality: job.quality,
      outputFormat: 'jpeg',
    });
    const uploaded = await uploadBase64Image(
      `data:${generated.mimeType};base64,${generated.base64}`,
      job.folder
    );
    await ImageGenerationJob.updateOne(
      { _id: job._id, status: 'processing' },
      {
        $set: { status: 'succeeded', result: uploaded },
        $unset: { leaseExpiresAt: 1, error: 1 },
      }
    );
  } catch (error) {
    await ImageGenerationJob.updateOne(
      { _id: job._id, status: 'processing' },
      {
        $set: { status: 'failed', error: safeError(error) },
        $unset: { leaseExpiresAt: 1 },
      }
    );
  }

  return true;
};

export const kickImageGenerationWorker = (): void => {
  if (workerPromise) return;
  workerPromise = (async () => {
    while (await processNextImageGenerationJob()) {
      // Drain queued jobs serially to keep provider and memory usage bounded.
    }
  })()
    .catch((error) => console.error('[image-generation] worker failed:', safeError(error)))
    .finally(() => { workerPromise = null; });
};

export const startImageGenerationWorker = (): NodeJS.Timeout => {
  kickImageGenerationWorker();
  const interval = setInterval(kickImageGenerationWorker, WORKER_INTERVAL_MS);
  interval.unref();
  return interval;
};
