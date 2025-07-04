const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getCache } = require('../config/redis');
const { logger } = require('../utils/logger');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        message: 'Please provide a valid authentication token'
      });
    }

    // Check cache first for blacklisted tokens
    const isBlacklisted = await getCache(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        error: 'Token invalid',
        message: 'This token has been revoked'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        message: 'The user associated with this token no longer exists'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        error: 'Account deactivated',
        message: 'Your account has been deactivated'
      });
    }

    // Add user to request object
    req.user = user;
    next();

  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'The provided token is invalid'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please log in again'
      });
    }

    return res.status(500).json({
      error: 'Authentication failed',
      message: 'An error occurred during authentication'
    });
  }
};

// Middleware to check if user has required role
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'You do not have permission to access this resource'
      });
    }

    next();
  };
};

// Middleware to check if user is admin
const requireAdmin = requireRole('admin');

// Middleware to check if user is moderator or admin
const requireModerator = requireRole(['admin', 'moderator']);

// Middleware to check if user owns the resource or is admin
const requireOwnership = (resourceField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource'
      });
    }

    const resourceUserId = req.params[resourceField] || req.body[resourceField];
    
    if (req.user.role === 'admin') {
      return next(); // Admins can access any resource
    }

    if (req.user._id.toString() !== resourceUserId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only access your own resources'
      });
    }

    next();
  };
};

// Middleware to check if user is room participant or owner
const requireRoomAccess = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    // Check if user is room owner
    const room = await Room.findOne({ roomId, owner: userId });
    if (room) {
      req.roomRole = 'owner';
      return next();
    }

    // Check if user is room participant
    const participantRoom = await Room.findOne({
      roomId,
      'participants.user': userId,
      'participants.isActive': true
    });

    if (participantRoom) {
      const participant = participantRoom.participants.find(
        p => p.user.toString() === userId.toString()
      );
      req.roomRole = participant.role;
      return next();
    }

    return res.status(403).json({
      error: 'Room access denied',
      message: 'You do not have access to this room'
    });

  } catch (error) {
    logger.error('Room access check error:', error);
    return res.status(500).json({
      error: 'Server error',
      message: 'An error occurred while checking room access'
    });
  }
};

// Middleware to check if user has specific room permission
const requireRoomPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const { roomId } = req.params;
      const userId = req.user._id;

      const room = await Room.findOne({ roomId });
      if (!room) {
        return res.status(404).json({
          error: 'Room not found',
          message: 'The specified room does not exist'
        });
      }

      // Check if user has the required permission
      if (!room.hasPermission(userId, permission)) {
        return res.status(403).json({
          error: 'Permission denied',
          message: `You do not have permission to ${permission} in this room`
        });
      }

      req.room = room;
      next();

    } catch (error) {
      logger.error('Room permission check error:', error);
      return res.status(500).json({
        error: 'Server error',
        message: 'An error occurred while checking permissions'
      });
    }
  };
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next(); // Continue without authentication
    }

    // Check cache for blacklisted tokens
    const isBlacklisted = await getCache(`blacklist:${token}`);
    if (isBlacklisted) {
      return next(); // Continue without authentication
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (user && user.isActive) {
      req.user = user;
    }

    next();

  } catch (error) {
    // Continue without authentication on error
    next();
  }
};

// Rate limiting for authentication endpoints
const authRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
};

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireModerator,
  requireOwnership,
  requireRoomAccess,
  requireRoomPermission,
  optionalAuth,
  authRateLimit
}; 