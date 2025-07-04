const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { asyncHandler, sendSuccessResponse, sendErrorResponse, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation rules
const updateProfileValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters'),
  body('preferences')
    .optional()
    .isObject()
    .withMessage('Preferences must be an object')
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().reduce((acc, error) => {
      acc[error.path] = error.msg;
      return acc;
    }, {});
    
    throw new ValidationError('Validation failed', formattedErrors);
  }
  next();
};

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', authenticateToken, asyncHandler(async (req, res) => {
  sendSuccessResponse(res, {
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      fullName: req.user.fullName,
      role: req.user.role,
      isVerified: req.user.isVerified,
      avatar: req.user.avatar,
      preferences: req.user.preferences,
      stats: req.user.stats,
      lastLogin: req.user.lastLogin,
      createdAt: req.user.createdAt
    }
  }, 'Profile retrieved successfully');
}));

// @route   PUT /api/users/profile
// @desc    Update current user profile
// @access  Private
router.put('/profile', authenticateToken, updateProfileValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { firstName, lastName, preferences } = req.body;

  // Update user fields
  if (firstName) req.user.firstName = firstName;
  if (lastName) req.user.lastName = lastName;
  if (preferences) {
    req.user.preferences = { ...req.user.preferences, ...preferences };
  }

  await req.user.save();

  logger.info('User profile updated', {
    userId: req.user._id,
    username: req.user.username
  });

  sendSuccessResponse(res, {
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      fullName: req.user.fullName,
      role: req.user.role,
      isVerified: req.user.isVerified,
      avatar: req.user.avatar,
      preferences: req.user.preferences
    }
  }, 'Profile updated successfully');
}));

// @route   GET /api/users/:userId
// @desc    Get user by ID (admin only)
// @access  Private (Admin)
router.get('/:userId', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId).select('-password');
  if (!user) {
    throw new NotFoundError('User not found');
  }

  sendSuccessResponse(res, { user }, 'User retrieved successfully');
}));

// @route   GET /api/users
// @desc    Get all users (admin only)
// @access  Private (Admin)
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role, isActive, search } = req.query;
  const skip = (page - 1) * limit;

  // Build query
  const query = {};
  if (role) query.role = role;
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (search) {
    query.$or = [
      { username: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } }
    ];
  }

  const users = await User.find(query)
    .select('-password')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  const total = await User.countDocuments(query);

  sendSuccessResponse(res, {
    users,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  }, 'Users retrieved successfully');
}));

// @route   PUT /api/users/:userId
// @desc    Update user (admin only)
// @access  Private (Admin)
router.put('/:userId', authenticateToken, requireAdmin, [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters'),
  body('role')
    .optional()
    .isIn(['user', 'admin', 'moderator'])
    .withMessage('Invalid role'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  body('isVerified')
    .optional()
    .isBoolean()
    .withMessage('isVerified must be a boolean')
], handleValidationErrors, asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { firstName, lastName, role, isActive, isVerified } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Update user fields
  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (role) user.role = role;
  if (isActive !== undefined) user.isActive = isActive;
  if (isVerified !== undefined) user.isVerified = isVerified;

  await user.save();

  logger.info('User updated by admin', {
    userId: user._id,
    username: user.username,
    updatedBy: req.user._id,
    updatedByUsername: req.user.username
  });

  sendSuccessResponse(res, {
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      role: user.role,
      isVerified: user.isVerified,
      isActive: user.isActive,
      avatar: user.avatar,
      createdAt: user.createdAt
    }
  }, 'User updated successfully');
}));

// @route   DELETE /api/users/:userId
// @desc    Delete user (admin only)
// @access  Private (Admin)
router.delete('/:userId', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Prevent admin from deleting themselves
  if (userId === req.user._id.toString()) {
    return sendErrorResponse(res, {
      message: 'You cannot delete your own account',
      statusCode: 400,
      code: 'SELF_DELETE_NOT_ALLOWED'
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  await User.findByIdAndDelete(userId);

  logger.info('User deleted by admin', {
    deletedUserId: user._id,
    deletedUsername: user.username,
    deletedBy: req.user._id,
    deletedByUsername: req.user.username
  });

  sendSuccessResponse(res, null, 'User deleted successfully');
}));

// @route   POST /api/users/:userId/activate
// @desc    Activate user account (admin only)
// @access  Private (Admin)
router.post('/:userId/activate', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  user.isActive = true;
  await user.save();

  logger.info('User activated by admin', {
    userId: user._id,
    username: user.username,
    activatedBy: req.user._id,
    activatedByUsername: req.user.username
  });

  sendSuccessResponse(res, null, 'User activated successfully');
}));

// @route   POST /api/users/:userId/deactivate
// @desc    Deactivate user account (admin only)
// @access  Private (Admin)
router.post('/:userId/deactivate', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Prevent admin from deactivating themselves
  if (userId === req.user._id.toString()) {
    return sendErrorResponse(res, {
      message: 'You cannot deactivate your own account',
      statusCode: 400,
      code: 'SELF_DEACTIVATE_NOT_ALLOWED'
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  user.isActive = false;
  await user.save();

  logger.info('User deactivated by admin', {
    userId: user._id,
    username: user.username,
    deactivatedBy: req.user._id,
    deactivatedByUsername: req.user.username
  });

  sendSuccessResponse(res, null, 'User deactivated successfully');
}));

// @route   GET /api/users/stats/overview
// @desc    Get user statistics overview (admin only)
// @access  Private (Admin)
router.get('/stats/overview', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ isActive: true });
  const verifiedUsers = await User.countDocuments({ isVerified: true });
  const adminUsers = await User.countDocuments({ role: 'admin' });
  const moderatorUsers = await User.countDocuments({ role: 'moderator' });

  // Get users created in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const newUsers = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

  // Get users who logged in recently
  const recentLogins = await User.countDocuments({ lastLogin: { $gte: thirtyDaysAgo } });

  sendSuccessResponse(res, {
    stats: {
      totalUsers,
      activeUsers,
      verifiedUsers,
      adminUsers,
      moderatorUsers,
      newUsers,
      recentLogins
    }
  }, 'User statistics retrieved successfully');
}));

module.exports = router; 