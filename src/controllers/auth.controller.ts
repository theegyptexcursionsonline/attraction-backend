import { consumeAccountRecovery, issueAccountRecovery, RECOVERY_ISSUER_FIELDS } from '../services/accountRecovery.service';
import { recordAudit } from '../services/auditLog.service';
import { accountSections } from '../middleware/section.middleware';
import {expectedPrincipal,principalMatches} from '../middleware/expected-principal';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { FilterQuery, UpdateQuery } from 'mongoose';
import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { Tenant } from '../models/Tenant';
import {
  generateAccessToken,
  generateRefreshToken,
  generateTwoFactorChallenge,
  verifyRefreshToken,
  verifyTwoFactorChallenge,
  LEGACY_REFRESH_ACCEPTED_UNTIL,
} from '../utils/jwt';
import { hashToken } from '../utils/hash';
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
import { createTwoFactorSetup, generateTwoFactorRecoveryCodes, verifyTwoFactorCode, twoFactorProofDeadline } from '../utils/twoFactor';
import { AppError } from '../middleware/error.middleware';
import { accountAuthorityFilter, accountAuthorityHash, exactStoredValue, factorProofAllows,
  normalizeLegacySessionEpoch, requiresLocalFactor, sessionEpoch } from '../utils/session';

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

/**
 * The account as JSON plus `effectiveSections`: the admin sections (tours, attractions, packages,
 * bundles) this account may use across its brands, so the admin menu can hide the rest. The API
 * enforces the same rule on every section endpoint.
 */
const withEffectiveSections = async (user: IUser): Promise<Record<string, unknown>> => {
  const json = user.toJSON() as Record<string, unknown>;
  if (ADMIN_ROLES.has(user.role)) json.effectiveSections = await accountSections(user);
  return json;
};

type AuthSnapshot = Pick<IUser, '_id' | 'email' | 'password' | 'firstName' | 'lastName' | 'role' | 'status' |
  'assignedTenants' | 'sectionAccess' | 'tokenVersion' | 'refreshToken' | 'twoFactorEnabled' | 'twoFactorSecretEnc' |
  'twoFactorPendingSecretEnc' | 'twoFactorSetupExpires' | 'twoFactorLastUsedStep' | 'twoFactorRecoveryCodeHashes' |
  'twoFactorChallengeHash' | 'twoFactorChallengeExpires'>;
const AUTH_FIELDS = '+password +refreshToken +twoFactorSecretEnc +twoFactorPendingSecretEnc +twoFactorSetupExpires ' +
  '+twoFactorLastUsedStep +twoFactorRecoveryCodeHashes +twoFactorChallengeHash +twoFactorChallengeExpires';
const CHALLENGE_FIELDS = ['twoFactorChallengeHash', 'twoFactorChallengeExpires', 'twoFactorPendingSecretEnc', 'twoFactorSetupExpires'];
const readAuthById = (id: unknown) => User.findById(id).select(AUTH_FIELDS).lean<AuthSnapshot>();
const effectiveAccount = (user: AuthSnapshot): IUser => User.hydrate(user);

interface SessionAdmission {
  mfaVerified?: boolean;
  filter?: (now: Date) => FilterQuery<IUser>;
  set?: Record<string, unknown>;
  unset?: string[];
  recoveryCodeHash?: string;
  advanceEpoch?: boolean;
  recordLogin?: boolean;
  includeUser?: boolean;
  deadline?: number;
}

/** Commit factor consumption and the native refresh grant together. The signed
 * proof is supplied only by a successful factor verifier (or a valid refresh).
 * No hydrated document is saved and no cookie escapes a lost admission race.
 */
const issueSession = async (snapshot: AuthSnapshot, res: Response, rememberMe = false, req?: AuthRequest, admission: SessionAdmission = {}) => {
  const proofAlive = () => admission.deadline === undefined || (Number.isFinite(admission.deadline) && Date.now() < admission.deadline);
  if (!proofAlive()) return null;
  let current = snapshot;
  if (admission.advanceEpoch && current.tokenVersion === null) {
    await normalizeLegacySessionEpoch(User, current._id);
    current = { ...current, tokenVersion: 0 };
  }
  if (!proofAlive()) return null;
  const proof = { mfaVerified: admission.mfaVerified === true };
  const target = effectiveAccount({ ...current, ...admission.set,
    tokenVersion: sessionEpoch(current.tokenVersion) + (admission.advanceEpoch ? 1 : 0) } as AuthSnapshot);
  if (target.status !== 'active' || !factorProofAllows(target, proof)) return null;
  const refreshToken = generateRefreshToken(target, proof);
  const update: UpdateQuery<IUser> = {
    $set: { ...admission.set, refreshToken: hashToken(refreshToken), ...(admission.recordLogin === false ? {} : { lastLogin: new Date() }) },
    ...(admission.unset?.length ? { $unset: Object.fromEntries(admission.unset.map(field => [field, 1])) } : {}),
    ...(admission.advanceEpoch ? { $inc: { tokenVersion: 1 } } : {}),
    ...(admission.recoveryCodeHash ? { $pull: { twoFactorRecoveryCodeHashes: admission.recoveryCodeHash } } : {}),
  };
  const user = await User.findOneAndUpdate({ $and: [accountAuthorityFilter(current), admission.filter?.(new Date(Date.now())) || {},
    ...(admission.deadline === undefined ? [] : [{ $expr: { $gt: [new Date(admission.deadline), '$$NOW'] } }]),
  ] }, update, { new: true, runValidators: true });
  if (!user) return null;
  if (!proofAlive()) return null;
  const response = admission.includeUser === false ? {} : await withEffectiveSections(user);
  if (!proofAlive()) return null;
  const accessToken = generateAccessToken(user, proof);
  if (!proofAlive()) return null;
  res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS);
  res.cookie('refreshToken', refreshToken, refreshCookieOptions(rememberMe));
  if (req && ADMIN_ROLES.has(user.role)) recordAudit(req, { action: 'auth.login', outcome: 'success', actor: user, statusCode: 200 });
  return response;
};

const activeChallenge = (hash: string, now: Date, expires?: Date): FilterQuery<IUser> => ({
  twoFactorChallengeHash: hash,
  twoFactorChallengeExpires: { $gt: now, ...(expires ? { $eq: expires } : {}) },
  $expr: { $gt: ['$twoFactorChallengeExpires', '$$NOW'] },
});
const pendingSetup = (user: AuthSnapshot, now: Date): FilterQuery<IUser> => ({
  twoFactorPendingSecretEnc: exactStoredValue(user.twoFactorPendingSecretEnc),
  twoFactorSetupExpires: { $eq: user.twoFactorSetupExpires, $gt: now },
  $expr: { $gt: ['$twoFactorSetupExpires', '$$NOW'] },
});
const changedSession = (res: Response) => sendError(res, 'Sign-in session changed. Please sign in again.', 409);
const factorError = (error: unknown, res: Response) => {
  if (error instanceof AppError) sendError(res, error.message, error.statusCode);
  else sendError(res, 'Two-factor verification is temporarily unavailable', 503);
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

    const userResponse = await issueSession(user.toObject() as AuthSnapshot, res, false, req);
    if (!userResponse) { changedSession(res); return; }

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

    sendSuccess(res, { user: userResponse }, 'Registration successful', 201);
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
    const user = await User.findOne({ email: email.toLowerCase() }).select(AUTH_FIELDS).lean<AuthSnapshot>();

    if (!user) {
      sendError(res, 'Invalid email or password', 401);
      return;
    }

    // Check password
    const isPasswordValid = typeof password === 'string' && typeof user.password === 'string' && await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      if (ADMIN_ROLES.has(user.role)) recordAudit(req, { action: 'auth.login_failed', outcome: 'failure', actor: user, statusCode: 401 });
      sendError(res, 'Invalid email or password', 401);
      return;
    }

    // Check status
    const account = effectiveAccount(user);
    if (account.status !== 'active') {
      if (ADMIN_ROLES.has(user.role)) recordAudit(req, { action: 'auth.login_failed', outcome: 'failure', actor: user, statusCode: 403 });
      sendError(res, 'Account is not active. Please contact support.', 403);
      return;
    }

    if (requiresLocalFactor(account)) {
      const challengeToken = generateTwoFactorChallenge(account, rememberMe === true);
      const challenge = verifyTwoFactorChallenge(challengeToken);
      const issued = await User.updateOne({ $and: [accountAuthorityFilter(user), {
        twoFactorChallengeHash: exactStoredValue(user.twoFactorChallengeHash),
        twoFactorChallengeExpires: exactStoredValue(user.twoFactorChallengeExpires),
      }] }, {
        $set: { twoFactorChallengeHash: hashToken(challengeToken), twoFactorChallengeExpires: new Date(challenge.exp! * 1000) },
        $unset: { twoFactorPendingSecretEnc: 1, twoFactorSetupExpires: 1 },
      });
      if (issued.matchedCount !== 1) { changedSession(res); return; }
      sendSuccess(
        res,
        account.twoFactorEnabled
          ? { requiresTwoFactor: true, challengeToken }
          : { requiresTwoFactorSetup: true, challengeToken },
        account.twoFactorEnabled ? 'Two-factor verification required' : 'Two-factor setup required',
        202
      );
      return;
    }

    const userResponse = await issueSession(user, res, rememberMe === true, req);
    if (!userResponse) { changedSession(res); return; }

    sendSuccess(res, { user: userResponse }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

const challengeUser = async (challengeToken: string) => {
  let challenge;
  try { challenge = verifyTwoFactorChallenge(challengeToken); }
  catch { throw new AppError('Invalid or expired two-factor challenge', 401); }
  const user = await readAuthById(challenge.userId);
  const tokenHash = hashToken(challengeToken);
  if (!user) throw new AppError('Invalid or expired two-factor challenge', 401);
  const account = effectiveAccount(user);
  if (account.status !== 'active' || !requiresLocalFactor(account) ||
    sessionEpoch(user.tokenVersion) !== challenge.sessionVersion || account.email !== challenge.email || account.role !== challenge.role ||
    accountAuthorityHash(user) !== challenge.authContext || user.twoFactorChallengeHash !== tokenHash ||
    !(user.twoFactorChallengeExpires instanceof Date) || user.twoFactorChallengeExpires.getTime() !== challenge.exp! * 1000 ||
    user.twoFactorChallengeExpires.getTime() <= Date.now()) {
    throw new AppError('Invalid or expired two-factor challenge', 401);
  }
  return { challenge, user, tokenHash };
};

const prepareTwoFactorSetup = async (challengeToken: string, recovered = false): Promise<Awaited<ReturnType<typeof createTwoFactorSetup>>> => {
  const { user, tokenHash } = await challengeUser(challengeToken);
  if (user.twoFactorEnabled === true) throw new AppError('Two-factor authentication is already enabled', 409);
  if (user.twoFactorPendingSecretEnc) {
    if (!(user.twoFactorSetupExpires instanceof Date) || user.twoFactorSetupExpires.getTime() <= Date.now()) {
      throw new AppError('Two-factor setup has expired. Sign in again.', 401);
    }
    const setup = await createTwoFactorSetup(user.email, { encryptedSecret: user.twoFactorPendingSecretEnc, expiresAt: user.twoFactorSetupExpires });
    const now = new Date(Date.now());
    const stillCurrent = await User.findOne({ $and: [accountAuthorityFilter(user),
      activeChallenge(tokenHash, now, user.twoFactorChallengeExpires), pendingSetup(user, now)] }).select('_id').lean();
    if (!stillCurrent) throw new AppError('Two-factor setup changed. Sign in again.', 409);
    if (Date.now() >= Math.min(user.twoFactorChallengeExpires!.getTime(), setup.expiresAt.getTime())) {
      throw new AppError('Two-factor setup has expired. Sign in again.', 401);
    }
    return setup;
  }
  const setup = await createTwoFactorSetup(user.email);
  setup.expiresAt = new Date(Math.min(setup.expiresAt.getTime(), user.twoFactorChallengeExpires!.getTime()));
  const now = new Date(Date.now());
  const written = await User.updateOne({ $and: [accountAuthorityFilter(user), activeChallenge(tokenHash, now, user.twoFactorChallengeExpires), {
    twoFactorPendingSecretEnc: exactStoredValue(user.twoFactorPendingSecretEnc),
    twoFactorSetupExpires: exactStoredValue(user.twoFactorSetupExpires),
  }] }, { $set: { twoFactorPendingSecretEnc: setup.encryptedSecret, twoFactorSetupExpires: setup.expiresAt } }, { runValidators: true });
  if (written.matchedCount === 1) {
    if (Date.now() >= user.twoFactorChallengeExpires!.getTime()) throw new AppError('Invalid or expired two-factor challenge', 401);
    return setup;
  }
  // Another request may have prepared this same challenge. Reuse its committed
  // secret once; a revoked/superseded challenge must never receive that secret.
  if (!recovered) return prepareTwoFactorSetup(challengeToken, true);
  throw new AppError('Two-factor setup changed. Sign in again.', 409);
};

export const setupTwoFactor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const setup = await prepareTwoFactorSetup(req.body.challengeToken);
    sendSuccess(res, { qrCodeDataUrl: setup.qrCodeDataUrl, manualSecret: setup.manualSecret, expiresAt: setup.expiresAt },
      'Scan the code and confirm one current authenticator code');
  } catch (error) { factorError(error, res); }
};

export const confirmTwoFactorSetup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { challengeToken, code } = req.body as { challengeToken: string; code: string };
    const { challenge, user, tokenHash } = await challengeUser(challengeToken);
    if (user.twoFactorEnabled === true) throw new AppError('Two-factor setup was already completed', 409);
    if (!user.twoFactorPendingSecretEnc || !(user.twoFactorSetupExpires instanceof Date) || user.twoFactorSetupExpires.getTime() <= Date.now()) {
      throw new AppError('Two-factor setup has expired. Start again.', 401);
    }
    const verified = await verifyTwoFactorCode({ encryptedSecret: user.twoFactorPendingSecretEnc, token: code });
    if (!verified.valid || !Number.isSafeInteger(verified.timeStep)) throw new AppError('Invalid authenticator code', 401);
    const recoveryCodes = generateTwoFactorRecoveryCodes();
    const response = await issueSession(user, res, challenge.rememberMe, req, {
      mfaVerified: true, advanceEpoch: true, deadline: Math.min(challenge.exp! * 1000, twoFactorProofDeadline(verified.timeStep!)),
      set: { twoFactorEnabled: true, twoFactorSecretEnc: user.twoFactorPendingSecretEnc,
        twoFactorLastUsedStep: verified.timeStep, twoFactorRecoveryCodeHashes: recoveryCodes.map(hashToken) },
      unset: [...CHALLENGE_FIELDS, 'passwordResetToken', 'passwordResetExpires'],
      filter: now => ({ $and: [activeChallenge(tokenHash, now, user.twoFactorChallengeExpires), pendingSetup(user, now)] }),
    });
    if (!response) { changedSession(res); return; }
    sendSuccess(res, { user: response, recoveryCodes }, 'Two-factor authentication enabled');
  } catch (error) { factorError(error, res); }
};

export const verifyTwoFactorLogin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { challengeToken, code } = req.body as { challengeToken: string; code: string };
    const { challenge, user, tokenHash } = await challengeUser(challengeToken);
    if (user.twoFactorEnabled !== true || !user.twoFactorSecretEnc) throw new AppError('Two-factor setup is required', 409);
    if (typeof code !== 'string') throw new AppError('Invalid authenticator code', 401);
    if (!/^\d{6}$/.test(code)) {
      const recoveryHash = hashToken(code.trim().toUpperCase());
      if (!user.twoFactorRecoveryCodeHashes?.includes(recoveryHash)) {
        recordAudit(req, { action: 'auth.two_factor_failed', outcome: 'failure', actor: user, statusCode: 401 });
        throw new AppError('Invalid or already-used recovery code', 401);
      }
      const response = await issueSession(user, res, challenge.rememberMe, req, {
        mfaVerified: true, recoveryCodeHash: recoveryHash, unset: CHALLENGE_FIELDS, deadline: challenge.exp! * 1000,
        filter: now => ({ $and: [activeChallenge(tokenHash, now, user.twoFactorChallengeExpires), { twoFactorRecoveryCodeHashes: recoveryHash }] }),
      });
      if (!response) { changedSession(res); return; }
      sendSuccess(res, { user: response }, 'Login successful');
      return;
    }
    const lastStep = user.twoFactorLastUsedStep;
    if (lastStep !== undefined && lastStep !== null && !Number.isSafeInteger(lastStep)) throw new AppError('Two-factor state is invalid', 401);
    const verified = await verifyTwoFactorCode({ encryptedSecret: user.twoFactorSecretEnc, token: code,
      ...(lastStep === undefined || lastStep === null ? {} : { afterTimeStep: lastStep }) });
    if (!verified.valid || !Number.isSafeInteger(verified.timeStep) ||
      (typeof lastStep === 'number' && verified.timeStep! <= lastStep)) {
      recordAudit(req, { action: 'auth.two_factor_failed', outcome: 'failure', actor: user, statusCode: 401 });
      throw new AppError('Invalid or already-used authenticator code', 401);
    }
    const response = await issueSession(user, res, challenge.rememberMe, req, {
      mfaVerified: true, set: { twoFactorLastUsedStep: verified.timeStep }, unset: CHALLENGE_FIELDS,
      deadline: Math.min(challenge.exp! * 1000, twoFactorProofDeadline(verified.timeStep!)),
      filter: now => ({ $and: [activeChallenge(tokenHash, now, user.twoFactorChallengeExpires),
        { twoFactorLastUsedStep: exactStoredValue(lastStep) }] }),
    });
    if (!response) { changedSession(res); return; }
    sendSuccess(res, { user: response }, 'Login successful');
  } catch (error) { factorError(error, res); }
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
    let user = await User.findOne({ email }).select(AUTH_FIELDS).lean<AuthSnapshot>();

    if (user && effectiveAccount(user).status !== 'active') return fail('account_inactive');

    // The assertion proves an email at the portal, not this platform's second factor. A team
    // account therefore never rides it: every admin role signs in here with its password and
    // two-factor code, whatever the portal itself verified.
    if (user && requiresLocalFactor(effectiveAccount(user))) {
      recordAudit(req, { action: 'auth.login_failed', outcome: 'failure', actor: user, statusCode: 403 });
      return fail('use_password_sign_in');
    }

    if (!user) {
      // First arrival → provision with an UNUSABLE random password (the pre-save hook
      // hashes it; no password login is possible) and the LOWEST role. We NEVER grant
      // admin/brand-admin/super-admin from the assertion, regardless of claims.role.
      const generatedPassword = crypto.randomBytes(32).toString('hex');
      const created = await User.create({
        email,
        password: generatedPassword,
        firstName: email.split('@')[0] || 'Customer',
        // lastName is required:true on the User schema, so an empty string fails
        // validation — use a non-empty placeholder the user can edit in their profile.
        lastName: 'Member',
        role: 'customer',
        status: 'active',
      });
      user = created.toObject() as AuthSnapshot;

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

    const userResponse = await issueSession(user, res, false, undefined, { deadline: claims.exp * 1000 });
    if (!userResponse) return fail('account_changed');
    sendSuccess(res, { user: userResponse }, 'Passport sign-in successful');
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Always end this browser's session, including when server-side revocation
  // fails. A database error still propagates; it is never reported as success.
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken', { path: '/api/auth/refresh-token' });
  try {
    if (req.user) {
      await normalizeLegacySessionEpoch(User, req.user._id);
      await User.findByIdAndUpdate(req.user._id, {
        $unset: { refreshToken: 1, ...Object.fromEntries(CHALLENGE_FIELDS.map(field => [field, 1])) },
        $inc: { tokenVersion: 1 },
      });
      if (ADMIN_ROLES.has(req.user.role)) recordAudit(req, { action: 'auth.logout', outcome: 'success', actor: req.user, statusCode: 200 });
    }

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
  const assertion=expectedPrincipal(req);
  if(!assertion.valid){sendError(res,'Invalid session account assertion',400);return;}
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      sendError(res, 'Refresh token required', 401);
      return;
    }

    // Only a refresh token is exchanged here; an access token or a two-factor challenge is refused
    // even before the stored-hash comparison below.
    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      sendError(res, 'Invalid refresh token', 401);
      return;
    }

    // Find user with refresh token
    const user = await readAuthById(decoded.userId);

    if (!user || !user.refreshToken) {
      sendError(res, 'Invalid refresh token', 401);
      return;
    }

    if (sessionEpoch(decoded.sessionVersion) !== sessionEpoch(user.tokenVersion)) {
      sendError(res, 'Session has been revoked', 401);
      return;
    }
    const account = effectiveAccount(user);
    const mfaVerified = decoded.type === 'refresh' && decoded.mfaVerified === true;
    if (account.status !== 'active' || !factorProofAllows(account, { mfaVerified })) {
      sendError(res, 'Sign in again to verify this account', 401);
      return;
    }

    // Verify stored token matches
    const hashedToken = hashToken(token);
    if (user.refreshToken !== hashedToken) {
      sendError(res, 'Invalid refresh token', 401);
      return;
    }

    if(!principalMatches(assertion.expected,String(user._id))){sendError(res,'Sign-in session changed',409);return;}

    const admitted = await issueSession(user, res, false, undefined, {
      mfaVerified, recordLogin: false, includeUser: false, filter: () => ({ refreshToken: hashedToken }),
      deadline: typeof decoded.exp === 'number' ? Math.min(decoded.exp * 1000, decoded.type === 'refresh' ? Infinity : LEGACY_REFRESH_ACCEPTED_UNTIL) : 0,
    });
    if (!admitted) { sendError(res, 'Invalid or already-used refresh token', 401); return; }
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

    sendSuccess(res, await withEffectiveSections(user), 'User retrieved');
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

    const user = await User.findOne({ email: email.toLowerCase() }).select(RECOVERY_ISSUER_FIELDS).lean();

    // Always return success to prevent email enumeration
    if (!user) {
      sendSuccess(res, null, 'If the email exists, a password reset link will be sent');
      return;
    }

    const issued = await issueAccountRecovery(user, 'reset');
    if (!issued) {
      sendSuccess(res, null, 'If the email exists, a password reset link will be sent');
      return;
    }

    // Resolve the site whose brand + reset-link domain this email should use.
    const tenantBrand = await accountEmailTenant(req, user);

    // Isolated on purpose. The token is already saved, so a provider outage must not turn this
    // into a 500 — and a 500 here would also be an account-enumeration oracle against the
    // deliberate "always report success" behaviour above.
    try {
      await sendPasswordResetEmail(
        user.email,
        issued.token,
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

    const result = await consumeAccountRecovery(token, password, 'reset');
    if (result.kind !== 'updated') {
      sendError(res, 'Invalid or expired reset token', 400);
      return;
    }
    const user = result.user;

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

    const result = await consumeAccountRecovery(token, password, 'invitation');
    if (result.kind === 'not_pending') {
      sendError(res, 'Invitation already accepted or account is not in pending state', 400);
      return;
    }
    if (result.kind !== 'updated') {
      sendError(res, 'Invalid or expired invitation token', 400);
      return;
    }
    const user = result.user;

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

    let user = await readAuthById(req.user._id);

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    // Verify current password
    if (effectiveAccount(user).status !== 'active' || sessionEpoch(req.user.tokenVersion) !== sessionEpoch(user.tokenVersion)) {
      changedSession(res); return;
    }
    const isPasswordValid = typeof currentPassword === 'string' && typeof user.password === 'string' && await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      sendError(res, 'Current password is incorrect', 400);
      return;
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) { sendError(res, 'Password must be at least 8 characters', 400); return; }
    const passwordHash = await bcrypt.hash(newPassword, await bcrypt.genSalt(12));
    if (user.tokenVersion === null) {
      await normalizeLegacySessionEpoch(User, user._id);
      user = { ...user, tokenVersion: 0 };
    }
    const updated = await User.findOneAndUpdate(accountAuthorityFilter(user), {
      $set: { password: passwordHash }, $inc: { tokenVersion: 1 },
      $unset: Object.fromEntries([...CHALLENGE_FIELDS, 'refreshToken', 'passwordResetToken', 'passwordResetExpires'].map(field => [field, 1])),
    }, { new: true, runValidators: true });
    if (!updated) { changedSession(res); return; }
    void notifyPasswordChanged(req, updated);

    if (req.user && ADMIN_ROLES.has(req.user.role)) recordAudit(req, { action: 'auth.password_changed', outcome: 'success', actor: req.user, statusCode: 200 });
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

    const allowedUpdates = ['firstName', 'lastName', 'phone', 'country', 'avatar', 'language', 'currency', 'interfaceLocale'];
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
