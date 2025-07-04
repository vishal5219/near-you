const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { authenticateToken, authRateLimit } = require('../middleware/auth');
const { asyncHandler, sendSuccessResponse, sendErrorResponse, ValidationError } = require('../middleware/errorHandler');
const { setCache, deleteCache } = require('../config/redis');
const { logger } = require('../utils/logger');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit(authRateLimit);

// Validation rules
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be less than 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be less than 50 characters')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
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

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', authLimiter, registerValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { username, email, password, firstName, lastName } = req.body;

  // Check if user already exists
  const emailExists = await User.emailExists(email);
  if (emailExists) {
    return sendErrorResponse(res, {
      message: 'Email already registered',
      statusCode: 400,
      code: 'EMAIL_EXISTS'
    });
  }

  const usernameExists = await User.usernameExists(username);
  if (usernameExists) {
    return sendErrorResponse(res, {
      message: 'Username already taken',
      statusCode: 400,
      code: 'USERNAME_EXISTS'
    });
  }

  // Create new user
  const user = new User({
    username,
    email,
    password,
    firstName,
    lastName
  });

  await user.save();

  // Generate token
  const token = user.generateAuthToken();

  // Cache user session
  await setCache(`session:${user._id}`, {
    userId: user._id,
    username: user.username,
    email: user.email,
    role: user.role
  }, 24 * 60 * 60); // 24 hours

  logger.info('User registered successfully', {
    userId: user._id,
    username: user.username,
    email: user.email
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
      avatar: user.avatar,
      preferences: user.preferences
    },
    token
  }, 'User registered successfully', 201);
}));

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', authLimiter, loginValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user by credentials
  const user = await User.findByCredentials(email, password);

  // Generate token
  const token = user.generateAuthToken();

  // Cache user session
  await setCache(`session:${user._id}`, {
    userId: user._id,
    username: user.username,
    email: user.email,
    role: user.role
  }, 24 * 60 * 60); // 24 hours

  logger.info('User logged in successfully', {
    userId: user._id,
    username: user.username,
    email: user.email
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
      avatar: user.avatar,
      preferences: user.preferences,
      lastLogin: user.lastLogin
    },
    token
  }, 'Login successful');
}));

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (token) {
    // Blacklist the token
    await setCache(`blacklist:${token}`, true, 24 * 60 * 60); // 24 hours
  }

  // Remove session from cache
  await deleteCache(`session:${req.user._id}`);

  logger.info('User logged out', {
    userId: req.user._id,
    username: req.user.username
  });

  sendSuccessResponse(res, null, 'Logout successful');
}));

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Private
router.post('/refresh', authenticateToken, asyncHandler(async (req, res) => {
  // Generate new token
  const token = req.user.generateAuthToken();

  // Update session cache
  await setCache(`session:${req.user._id}`, {
    userId: req.user._id,
    username: req.user.username,
    email: req.user.email,
    role: req.user.role
  }, 24 * 60 * 60); // 24 hours

  logger.info('Token refreshed', {
    userId: req.user._id,
    username: req.user.username
  });

  sendSuccessResponse(res, {
    token,
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
  }, 'Token refreshed successfully');
}));

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
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

// @route   PUT /api/auth/me
// @desc    Update current user profile
// @access  Private
router.put('/me', authenticateToken, [
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
], handleValidationErrors, asyncHandler(async (req, res) => {
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

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', authenticateToken, changePasswordValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Verify current password
  const isMatch = await req.user.comparePassword(currentPassword);
  if (!isMatch) {
    return sendErrorResponse(res, {
      message: 'Current password is incorrect',
      statusCode: 400,
      code: 'INVALID_PASSWORD'
    });
  }

  // Update password
  req.user.password = newPassword;
  await req.user.save();

  // Blacklist all existing tokens for this user
  // In a real app, you might want to implement a more sophisticated token management system
  await deleteCache(`session:${req.user._id}`);

  logger.info('Password changed', {
    userId: req.user._id,
    username: req.user.username
  });

  sendSuccessResponse(res, null, 'Password changed successfully');
}));

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', authLimiter, [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
], handleValidationErrors, asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal if email exists or not for security
    return sendSuccessResponse(res, null, 'If the email exists, a password reset link has been sent');
  }

  // Generate reset token
  const resetToken = require('crypto').randomBytes(32).toString('hex');
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Store reset token in cache
  await setCache(`reset:${resetToken}`, {
    userId: user._id.toString(),
    email: user.email
  }, 60 * 60); // 1 hour

  // TODO: Send email with reset link
  // For now, just log the token
  logger.info('Password reset token generated', {
    userId: user._id,
    email: user.email,
    resetToken
  });

  sendSuccessResponse(res, null, 'If the email exists, a password reset link has been sent');
}));

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', authLimiter, [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
], handleValidationErrors, asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  // Get reset token from cache
  const resetData = await getCache(`reset:${token}`);
  if (!resetData) {
    return sendErrorResponse(res, {
      message: 'Invalid or expired reset token',
      statusCode: 400,
      code: 'INVALID_RESET_TOKEN'
    });
  }

  // Find user
  const user = await User.findById(resetData.userId);
  if (!user) {
    return sendErrorResponse(res, {
      message: 'User not found',
      statusCode: 404,
      code: 'USER_NOT_FOUND'
    });
  }

  // Update password
  user.password = newPassword;
  await user.save();

  // Delete reset token
  await deleteCache(`reset:${token}`);

  // Blacklist all existing sessions
  await deleteCache(`session:${user._id}`);

  logger.info('Password reset successfully', {
    userId: user._id,
    email: user.email
  });

  sendSuccessResponse(res, null, 'Password reset successfully');
}));

module.exports = router; 