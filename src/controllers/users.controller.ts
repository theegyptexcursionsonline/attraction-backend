import { Response, NextFunction } from 'express';
import { User } from '../models/User';
import { Attraction } from '../models/Attraction';
import { Tenant } from '../models/Tenant';
import { sendSuccess, sendError, sendPaginated } from '../utils/response';
import { AuthRequest } from '../types';
import { generateRandomToken, hashToken } from '../utils/hash';
import { sendUserInvitation } from '../services/email.service';
import { escapeRegex } from '../utils/helpers';

// User Profile Endpoints
export const getProfile = async (
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
      .populate('wishlist', 'slug title images priceFrom currency destination')
      .lean();

    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};

export const getWishlist = async (
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
      .populate({
        path: 'wishlist',
        match: { status: 'active' },
        select: 'slug title images priceFrom currency destination rating reviewCount badges',
      })
      .lean();

    sendSuccess(res, user?.wishlist || []);
  } catch (error) {
    next(error);
  }
};

export const addToWishlist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { attractionId } = req.params;

    // Verify attraction exists
    const attraction = await Attraction.findById(attractionId);
    if (!attraction) {
      sendError(res, 'Attraction not found', 404);
      return;
    }

    // Add to wishlist if not already there
    await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { wishlist: attractionId } }
    );

    sendSuccess(res, null, 'Added to wishlist');
  } catch (error) {
    next(error);
  }
};

export const removeFromWishlist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { attractionId } = req.params;

    await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { wishlist: attractionId } }
    );

    sendSuccess(res, null, 'Removed from wishlist');
  } catch (error) {
    next(error);
  }
};

// Admin User Management
export const getUsers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const query: Record<string, unknown> = {};

    // Non-super-admins can only see users who share at least one of their assigned tenants
    if (req.user && req.user.role !== 'super-admin') {
      const userTenantIds = req.user.assignedTenants || [];
      if (userTenantIds.length > 0) {
        query.assignedTenants = { $in: userTenantIds };
      } else {
        // No assigned tenants — return empty
        sendPaginated(res, [], pageNum, limitNum, 0);
        return;
      }
    }

    if (role) {
      query.role = role;
    }

    if (status) {
      query.status = status;
    }

    if (search) {
      const safeSearch = escapeRegex(search as string);
      query.$or = [
        { email: { $regex: safeSearch, $options: 'i' } },
        { firstName: { $regex: safeSearch, $options: 'i' } },
        { lastName: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .populate('assignedTenants', 'name slug')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query),
    ]);

    sendPaginated(res, users, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .populate('assignedTenants', 'name slug')
      .lean();

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};

export const inviteUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, firstName, lastName, role, assignedTenants } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      sendError(res, 'User with this email already exists', 409);
      return;
    }

    // Generate secure temporary password and dedicated invitation token
    const tempPassword = generateRandomToken(24);
    const invitationToken = generateRandomToken();

    // Create user with pending status
    const user = await User.create({
      email: email.toLowerCase(),
      password: tempPassword,
      firstName,
      lastName,
      role,
      status: 'pending',
      assignedTenants,
      passwordResetToken: hashToken(invitationToken),
      passwordResetExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // Resolve the invited user's primary site so the invite link + email are
    // branded for THAT site (custom domain / ?tenant=) not the generic platform.
    let inviteTenant = null;
    if (Array.isArray(assignedTenants) && assignedTenants.length > 0) {
      inviteTenant = await Tenant.findById(assignedTenants[0])
        .select('name slug customDomain domainMigrated')
        .lean();
    }

    // Send invitation email
    await sendUserInvitation(
      user.email,
      invitationToken,
      req.user ? `${req.user.firstName} ${req.user.lastName}`.trim() : 'Attractions Network',
      role,
      inviteTenant
    );

    sendSuccess(res, user, 'User invited successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { firstName, lastName, role, status, assignedTenants } = req.body;

    const updates: Record<string, unknown> = {};
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (role !== undefined) updates.role = role;
    if (status !== undefined) updates.status = status;
    if (assignedTenants !== undefined) updates.assignedTenants = assignedTenants;

    const user = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('assignedTenants', 'name slug');

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    sendSuccess(res, user, 'User updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    // Don't allow deleting yourself
    if (req.user?._id.toString() === id) {
      sendError(res, 'Cannot delete your own account', 400);
      return;
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    sendSuccess(res, null, 'User deleted successfully');
  } catch (error) {
    next(error);
  }
};
