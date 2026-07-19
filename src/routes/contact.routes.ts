import { Router, Response, NextFunction } from 'express';
import { sendContactFormEmail } from '../services/email.service';
import { sendSuccess, sendError } from '../utils/response';
import { optionalTenant, requireTenant } from '../middleware/tenant.middleware';
import { AuthRequest } from '../types';
import { publicWriteLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

router.post('/', publicWriteLimiter, optionalTenant, requireTenant, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { firstName, lastName, email, subject, message } = req.body;

    if (!firstName || !lastName || !email || !subject || !message) {
      sendError(res as any, 'All fields are required', 400);
      return;
    }

    if (
      typeof firstName !== 'string' || firstName.trim().length > 80 ||
      typeof lastName !== 'string' || lastName.trim().length > 80 ||
      typeof email !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim()) ||
      typeof subject !== 'string' || subject.trim().length > 160 ||
      typeof message !== 'string' || message.trim().length > 5000
    ) {
      sendError(res, 'Invalid contact form data', 400);
      return;
    }

    await sendContactFormEmail(req.tenant!, `${firstName.trim()} ${lastName.trim()}`, email.trim(), subject.trim(), message.trim());

    sendSuccess(res as any, null, 'Message sent successfully');
  } catch (error) {
    next(error);
  }
});

export default router;
