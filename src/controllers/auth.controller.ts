import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import {
  generateAccessToken,
  generateRefreshToken,
  generateTwoFactorChallenge,
  verifyToken,
  verifyTwoFactorChallenge,
} from '../utils/jwt';
import { generateRandomToken, hashToken } from '../utils/hash';
import { verifyPassportAssertion } from '../utils/passport';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest, IUser } from '../types';
import { env } from '../config/env';
import {
  EmailTenant,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from '../services/email.service';
import { createAdminNotifications } from '../services/notification.service';
import { createTwoFactorSetup, generateTwoFactorRecoveryCodes, verifyTwoFactorCode } from '../utils/twoFactor';

const ADMIN_ROLES = new Set(['super-admin', 'brand-admin', 'manager', 'editor', 'viewer']);

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

const issueSession = async (user: IUser, res: Response, rememberMe = false) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  user.refreshToken = hashToken(refreshToken);
  user.lastLogin = new Date();
  await user.save();
  res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
  res.cookie('refreshToken', refreshToken, refreshCookieOptions(rememberMe));
  return user.toJSON();
};

const TENANT_EMAIL_FIELDS =
  'name slug customDomain domainMigrated theme logo contactInfo defaultLanguage defaultCurrency timezone';

/**
 * Which site an account email should speak in.
 *
 * Prefer the site the request actually came from, but ONLY when the user really belongs to it —
 * otherwise a storefront header could dress an account email in a brand the user has nothing to
 * do with. Fall back to the user's own first assigned site. A customer with no assigned sites on
 * a known storefront is branded by that storefront, which is the site they just used.
 *
 * This replaces branding purely by `assignedTenants[0]`, which sent a staff user who reset from
 * site B an email — and a reset LINK on site A's domain.
 */
const accountEmailTenant = async (
  req: AuthRequest,
  user: { assignedTenants?: Array<{ toString(): string }> | null }
): Promise<EmailTenant | null> => {
  const assigned = (user.assignedTenants || []).map((id) => String(id));
  const activeTenantId = req.tenant?._id ? String(req.tenant._id) : null;
  const chosen = activeTenantId && (assigned.length === 0 || assigned.includes(activeTenantId))
    ? activeTenantId
    : assigned[0];
  if (!chosen) return null;
  const tenant = await Tenant.findById(chosen).select(TENANT_EMAIL_FIELDS).lean();
  return (tenant as unknown as EmailTenant) || null;
};

/**
 * Fire-and-forget "your password was changed" notice. Detached from the response and guarded at
 * every step: the password change already succeeded and must never be reported as a failure
 * because the mail provider was down.
 */
const notifyPasswordChanged = (
  req: AuthRequest,
  user: { email: string; firstName?: string; lastName?: string; assignedTenants?: Array<{ toString(): string }> | null },
  byAdmin = false
): void => {
  void accountEmailTenant(req, user)
    .then((tenant) =>
      sendPasswordChangedEmail(
        user.email,
        { userName: `${user.firstName || ''} ${user.lastName || ''}`.trim(), byAdmin },
        tenant
      )
    )
    .catch((error) => console.error('[email] password-changed notice failed', { error: error?.message }));
};

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

    // Welcome the new account holder. Deduped per address per site, and isolated: a mail
    // failure must never turn a successful registration into a 500.
    void accountEmailTenant(req, user)
      .then((tenant) => sendWelcomeEmail(user.email, `${firstName} ${lastName}`.trim(), tenant))
      .catch((error) => console.error('[email] welcome send failed', { error: error?.message }));

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

    if (ADMIN_ROLES.has(user.role)) {
      const challengeToken = generateTwoFactorChallenge(user, rememberMe === true);
      sendSuccess(
        res,
        user.twoFactorEnabled
          ? { requiresTwoFactor: true, challengeToken }
          : { requiresTwoFactorSetup: true, challengeToken },
        user.twoFactorEnabled ? 'Two-factor verification required' : 'Two-factor setup required',
        202
      );
      return;
    }

    const userResponse = await issueSession(user, res, rememberMe === true);

    sendSuccess(res, { user: userResponse }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

const challengeUser = async (challengeToken: string, extraSelection = '') => {
  const challenge = verifyTwoFactorChallenge(challengeToken);
  const user = await User.findById(challenge.userId).select(extraSelection);
  if (
    !user ||
    user.status !== 'active' ||
    !ADMIN_ROLES.has(user.role) ||
    (user.tokenVersion || 0) !== (challenge.sessionVersion || 0)
  ) {
    throw new Error('Invalid two-factor challenge');
  }
  return { challenge, user };
};

export const setupTwoFactor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { challengeToken } = req.body as { challengeToken: string };
    const { user } = await challengeUser(challengeToken, '+twoFactorPendingSecretEnc +twoFactorSetupExpires');
    if (user.twoFactorEnabled) {
      sendError(res, 'Two-factor authentication is already enabled', 409);
      return;
    }
    const setup = await createTwoFactorSetup(user.email);
    user.twoFactorPendingSecretEnc = setup.encryptedSecret;
    user.twoFactorSetupExpires = setup.expiresAt;
    await user.save();
    sendSuccess(res, {
      qrCodeDataUrl: setup.qrCodeDataUrl,
      manualSecret: setup.manualSecret,
      expiresAt: setup.expiresAt,
    }, 'Scan the code and confirm one current authenticator code');
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('ENCRYPTION_KEY')) {
      sendError(res, 'Two-factor setup is temporarily unavailable', 503);
      return;
    }
    sendError(res, 'Invalid or expired two-factor challenge', 401);
  }
};

export const confirmTwoFactorSetup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { challengeToken, code } = req.body as { challengeToken: string; code: string };
    const { challenge, user } = await challengeUser(
      challengeToken,
      '+twoFactorPendingSecretEnc +twoFactorSetupExpires'
    );
    if (
      !user.twoFactorPendingSecretEnc ||
      !user.twoFactorSetupExpires ||
      user.twoFactorSetupExpires.getTime() <= Date.now()
    ) {
      sendError(res, 'Two-factor setup has expired. Start again.', 401);
      return;
    }
    const result = await verifyTwoFactorCode({ encryptedSecret: user.twoFactorPendingSecretEnc, token: code });
    if (!result.valid || result.timeStep === undefined) {
      sendError(res, 'Invalid authenticator code', 401);
      return;
    }
    const recoveryCodes = generateTwoFactorRecoveryCodes();
    const recoveryCodeHashes = recoveryCodes.map(hashToken);
    const enabledUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        tokenVersion: challenge.sessionVersion || 0,
        twoFactorEnabled: false,
      },
      {
        $set: {
          twoFactorEnabled: true,
          twoFactorSecretEnc: user.twoFactorPendingSecretEnc,
          twoFactorLastUsedStep: result.timeStep,
          twoFactorRecoveryCodeHashes: recoveryCodeHashes,
        },
        $unset: { twoFactorPendingSecretEnc: 1, twoFactorSetupExpires: 1 },
      },
      { new: true }
    );
    if (!enabledUser) {
      sendError(res, 'Two-factor setup was already completed or the session changed', 409);
      return;
    }
    const userResponse = await issueSession(enabledUser, res, challenge.rememberMe);
    sendSuccess(res, { user: userResponse, recoveryCodes }, 'Two-factor authentication enabled');
  } catch {
    sendError(res, 'Invalid or expired two-factor challenge', 401);
  }
};

export const verifyTwoFactorLogin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { challengeToken, code } = req.body as { challengeToken: string; code: string };
    const { challenge, user } = await challengeUser(
      challengeToken,
      '+twoFactorSecretEnc +twoFactorLastUsedStep +twoFactorRecoveryCodeHashes'
    );
    if (!user.twoFactorEnabled || !user.twoFactorSecretEnc) {
      sendError(res, 'Two-factor setup is required', 409);
      return;
    }
    const isTotp = /^\d{6}$/.test(code);
    if (!isTotp) {
      const normalizedRecoveryCode = code.trim().toUpperCase();
      const recoveryHash = hashToken(normalizedRecoveryCode);
      const recoveredUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          tokenVersion: challenge.sessionVersion || 0,
          twoFactorEnabled: true,
          twoFactorRecoveryCodeHashes: recoveryHash,
        },
        { $pull: { twoFactorRecoveryCodeHashes: recoveryHash } },
        { new: true }
      );
      if (!recoveredUser) {
        sendError(res, 'Invalid or already-used recovery code', 401);
        return;
      }
      const userResponse = await issueSession(recoveredUser, res, challenge.rememberMe);
      sendSuccess(res, { user: userResponse }, 'Login successful');
      return;
    }

    const result = await verifyTwoFactorCode({
      encryptedSecret: user.twoFactorSecretEnc,
      token: code,
      afterTimeStep: user.twoFactorLastUsedStep,
    });
    if (!result.valid || result.timeStep === undefined) {
      sendError(res, 'Invalid or already-used authenticator code', 401);
      return;
    }
    const verifiedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        tokenVersion: challenge.sessionVersion || 0,
        twoFactorEnabled: true,
        $or: [
          { twoFactorLastUsedStep: { $lt: result.timeStep } },
          { twoFactorLastUsedStep: { $exists: false } },
        ],
      },
      { $set: { twoFactorLastUsedStep: result.timeStep } },
      { new: true }
    );
    if (!verifiedUser) {
      sendError(res, 'Authenticator code was already used', 409);
      return;
    }
    const userResponse = await issueSession(verifiedUser, res, challenge.rememberMe);
    sendSuccess(res, { user: userResponse }, 'Login successful');
  } catch {
    sendError(res, 'Invalid or expired two-factor challenge', 401);
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

      // Same welcome as self-serve registration: an SSO arrival is still a new account.
      const provisioned = user;
      void accountEmailTenant(req, provisioned)
        .then((tenant) => sendWelcomeEmail(provisioned.email, `${provisioned.firstName} ${provisioned.lastName}`.trim(), tenant))
        .catch((error) => console.error('[email] welcome send failed', { error: error?.message }));
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

    // Resolve the site whose brand + reset-link domain this email should use.
    const tenantBrand = await accountEmailTenant(req, user);

    // Isolated on purpose. The token is already saved, so a provider outage must not turn this
    // into a 500 — and a 500 here would also be an account-enumeration oracle against the
    // deliberate "always report success" behaviour above.
    try {
      await sendPasswordResetEmail(
        user.email,
        resetToken,
        `${user.firstName} ${user.lastName}`.trim(),
        tenantBrand
      );
    } catch (error) {
      console.error('[email] password reset send failed', {
        tenant: tenantBrand?.slug || 'platform',
        error: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
      });
    }

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

    // Tell the account holder their password moved. This is the message that lets someone
    // notice a compromised account, so it is sent on every change.
    void notifyPasswordChanged(req, user);

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

    void notifyPasswordChanged(req, user);

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

    void notifyPasswordChanged(req, user);

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
