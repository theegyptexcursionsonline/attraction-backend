import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../utils/jwt';
import { generateRandomToken, hashToken } from '../utils/hash';
import { verifyPassportAssertion } from '../utils/passport';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';
import { env } from '../config/env';
import { sendPasswordResetEmail } from '../services/email.service';
import { createAdminNotifications } from '../services/notification.service';

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax' as const,
  maxAge: 15 * 60 * 1000,
};

const refreshCookieOptions = (rememberMe = false) => ({
  ...ACCESS_COOKIE_OPTIONS,
  maxAge: (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000,
  path: '/api/auth/refresh-token',
});

export const register = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password, firstName, lastName, phone, country } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      sendError(res, 'Email already registered', 409);
      return;
    }

    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      phone,
      country,
      role: 'customer',
      status: 'active',
    });

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token
    user.refreshToken = hashToken(refreshToken);
    user.lastLogin = new Date();
    await user.save();

    // Set cookies
    res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refreshToken', refreshToken, refreshCookieOptions());

    // Notify admins about new user
    createAdminNotifications({
      type: 'user',
      title: 'New User Registered',
      message: `${firstName} ${lastName} (${email}) created an account`,
      link: '/admin/users',
      data: { userId: user._id },
    }).catch(() => {});

    sendSuccess(res, { user }, 'Registration successful', 201);
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password, rememberMe } = req.body;

    // Find user with password
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      sendError(res, 'Invalid email or password', 401);
      return;
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      sendError(res, 'Invalid email or password', 401);
      return;
    }

    // Check status
    if (user.status !== 'active') {
      sendError(res, 'Account is not active. Please contact support.', 403);
      return;
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token
    user.refreshToken = hashToken(refreshToken);
    user.lastLogin = new Date();
    await user.save();

    // Set cookies
    res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refreshToken', refreshToken, refreshCookieOptions(rememberMe === true));

    // Remove password from response
    const userResponse = user.toJSON();

    sendSuccess(res, { user: userResponse }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

// Foxes Passport SSO: a client clicks "Open Attractions Network" in the Foxes portal
// and arrives here with a short-lived ?assertion=. We verify it against the SHARED
// Foxes secret, resolve (or provision) the account by email with the LOWEST sensible
// role, mint THIS platform's OWN native JWTs, set the same httpOnly cookies login()
// sets, and redirect to the web app's /dashboard.
export const passportLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // First configured FRONTEND_URL origin (the env can be comma-separated).
    const frontendBase = (env.frontendUrl.split(',')[0] || 'http://localhost:3000').trim().replace(/\/+$/, '');
    const fail = (code: string): void => {
      res.redirect(`${frontendBase}/login?error=${encodeURIComponent(code)}`);
    };

    if (!env.foxesPassportSecret) return fail('sso_disabled');

    const assertion =
      typeof req.query.assertion === 'string'
        ? req.query.assertion
        : typeof req.body?.assertion === 'string'
          ? req.body.assertion
          : '';

    const claims = verifyPassportAssertion(assertion);
    if (!claims) return fail('invalid_or_expired_link');

    const email = claims.email.toLowerCase().trim();
    let user = await User.findOne({ email }).select('+refreshToken');

    if (user && user.status !== 'active') return fail('account_inactive');

    if (!user) {
      // First arrival → provision with an UNUSABLE random password (the pre-save hook
      // hashes it; no password login is possible) and the LOWEST role. We NEVER grant
      // admin/brand-admin/super-admin from the assertion, regardless of claims.role.
      const generatedPassword = crypto.randomBytes(32).toString('hex');
      user = await User.create({
        email,
        password: generatedPassword,
        firstName: email.split('@')[0] || 'Customer',
        // lastName is required:true on the User schema, so an empty string fails
        // validation — use a non-empty placeholder the user can edit in their profile.
        lastName: 'Member',
        role: 'customer',
        status: 'active',
      });

      createAdminNotifications({
        type: 'user',
        title: 'New User via Foxes Passport',
        message: `${email} signed in through Foxes Passport SSO`,
        link: '/admin/users',
        data: { userId: user._id },
      }).catch(() => {});
    }

    // Mint THIS platform's own tokens (signed with env.jwtSecret via utils/jwt).
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = hashToken(refreshToken);
    user.lastLogin = new Date();
    await user.save();

    res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refreshToken', refreshToken, refreshCookieOptions());

    sendSuccess(res, { user: user.toJSON() }, 'Passport sign-in successful');
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, {
        $unset: { refreshToken: 1 },
        $inc: { tokenVersion: 1 },
      });
    }

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken', { path: '/api/auth/refresh-token' });

    sendSuccess(res, null, 'Logout successful');
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      sendError(res, 'Refresh token required', 401);
      return;
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      sendError(res, 'Invalid refresh token', 401);
      return;
    }

    // Find user with refresh token
    const user = await User.findById(decoded.userId).select('+refreshToken');

    if (!user || !user.refreshToken) {
      sendError(res, 'Invalid refresh token', 401);
      return;
    }

    if ((decoded.sessionVersion || 0) !== (user.tokenVersion || 0)) {
      sendError(res, 'Session has been revoked', 401);
      return;
    }

    // Verify stored token matches
    const hashedToken = hashToken(token);
    if (user.refreshToken !== hashedToken) {
      sendError(res, 'Invalid refresh token', 401);
      return;
    }

    // Generate new tokens
    const accessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Update refresh token
    user.refreshToken = hashToken(newRefreshToken);
    await user.save();

    // Set cookies
    res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refreshToken', newRefreshToken, refreshCookieOptions());

    sendSuccess(res, null, 'Token refreshed');
  } catch (error) {
    next(error);
  }
};

export const me = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const user = await User.findById(req.user._id)
      .populate('wishlist', 'slug title images priceFrom currency')
      .populate('assignedTenants', 'name slug logo');

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    sendSuccess(res, user, 'User retrieved');
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success to prevent email enumeration
    if (!user) {
      sendSuccess(res, null, 'If the email exists, a password reset link will be sent');
      return;
    }

    // Generate reset token
    const resetToken = generateRandomToken();
    user.passwordResetToken = hashToken(resetToken);
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // Resolve the user's primary tenant so the reset link + email speak in that
    // brand (custom domain / ?tenant=) instead of the generic platform.
    let tenantBrand = null;
    const primaryTenantId = user.assignedTenants?.[0];
    if (primaryTenantId) {
      tenantBrand = await Tenant.findById(primaryTenantId)
        .select('name slug customDomain domainMigrated theme logo contactInfo defaultLanguage defaultCurrency timezone')
        .lean();
    }

    // Send password reset email
    await sendPasswordResetEmail(
      user.email,
      resetToken,
      `${user.firstName} ${user.lastName}`.trim(),
      tenantBrand
    );

    sendSuccess(res, null, 'If the email exists, a password reset link will be sent');
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token, password } = req.body;

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      sendError(res, 'Invalid or expired reset token', 400);
      return;
    }

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    sendSuccess(res, null, 'Password reset successful');
  } catch (error) {
    next(error);
  }
};

export const acceptInvitation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token, password } = req.body;

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      sendError(res, 'Invalid or expired invitation token', 400);
      return;
    }

    if (user.status !== 'pending') {
      sendError(res, 'Invitation already accepted or account is not in pending state', 400);
      return;
    }

    // Set password and activate account
    user.password = password;
    user.status = 'active';
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    sendSuccess(res, null, 'Invitation accepted successfully. You can now log in.');
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      sendError(res, 'Current password is incorrect', 400);
      return;
    }

    // Update password
    user.password = newPassword;
    await user.save();

    sendSuccess(res, null, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const allowedUpdates = ['firstName', 'lastName', 'phone', 'country', 'avatar', 'language', 'currency'];
    const updates: Record<string, unknown> = {};

    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    sendSuccess(res, user, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};
