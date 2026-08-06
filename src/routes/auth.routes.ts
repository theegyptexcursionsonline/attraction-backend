import { Router } from 'express';
import {
  register,
  login,
  logout,
  refreshToken,
  me,
  forgotPassword,
  resetPassword,
  acceptInvitation,
  changePassword,
  updateProfile,
  passportLogin,
  setupTwoFactor,
  confirmTwoFactorSetup,
  verifyTwoFactorLogin,
} from '../controllers/auth.controller';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { authLimiter, passwordResetLimiter } from '../middleware/rate-limit.middleware';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInvitationSchema,
  changePasswordSchema,
  updateProfileSchema,
} from '../utils/validators';
import { z } from 'zod';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Registration successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/register', authLimiter, validate(registerSchema), register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', authLimiter, validate(loginSchema), login);

const twoFactorChallengeSchema = z.object({
  challengeToken: z.string().min(20).max(4096),
});
const twoFactorCodeSchema = twoFactorChallengeSchema.extend({
  code: z.string().trim().transform((value) => value.toUpperCase()).refine(
    (value) => /^\d{6}$/.test(value) || /^AN-[A-F0-9]{4}-[A-F0-9]{4}$/.test(value),
    'Enter a 6-digit authenticator code or a valid recovery code'
  ),
});

router.post('/2fa/setup', authLimiter, validate(twoFactorChallengeSchema), setupTwoFactor);
router.post('/2fa/confirm', authLimiter, validate(twoFactorCodeSchema), confirmTwoFactorSetup);
router.post('/2fa/verify', authLimiter, validate(twoFactorCodeSchema), verifyTwoFactorLogin);

/**
 * @swagger
 * /auth/passport:
 *   get:
 *     summary: Foxes Passport SSO landing — verify a signed assertion and start a session
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: assertion
 *         schema:
 *           type: string
 *         required: true
 *         description: Short-lived Foxes Passport assertion (aud=attraction)
 *     responses:
 *       302:
 *         description: Redirects to the web app /dashboard on success, or /login?error=... on failure
 */
router.get('/passport', authLimiter, passportLogin);
router.post('/passport', authLimiter, passportLogin);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/refresh-token', refreshToken);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       429:
 *         description: Too many requests
 */
router.post('/forgot-password', passwordResetLimiter, validate(forgotPasswordSchema), forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);

/**
 * @swagger
 * /auth/accept-invitation:
 *   post:
 *     summary: Accept invitation and set password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Invitation accepted successfully
 *       400:
 *         description: Invalid or expired invitation token
 */
router.post('/accept-invitation', passwordResetLimiter, validate(acceptInvitationSchema), acceptInvitation);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', optionalAuth, logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/me', authenticate, me);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/change-password', authenticate, validate(changePasswordSchema), changePassword);

/**
 * @swagger
 * /auth/profile:
 *   patch:
 *     summary: Update profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *               country:
 *                 type: string
 *               avatar:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.patch('/profile', authenticate, validate(updateProfileSchema), updateProfile);

export default router;
