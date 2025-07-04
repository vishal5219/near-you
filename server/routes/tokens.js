const express = require('express');
const { body, validationResult } = require('express-validator');
const Room = require('../models/Room');
const { authenticateToken, requireRoomAccess } = require('../middleware/auth');
const { asyncHandler, sendSuccessResponse, sendErrorResponse, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const livekitService = require('../services/livekit');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation rules
const roomTokenValidation = [
  body('roomId')
    .notEmpty()
    .withMessage('Room ID is required'),
  body('participantName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Participant name must be between 1 and 100 characters')
];

const recordingTokenValidation = [
  body('roomId')
    .notEmpty()
    .withMessage('Room ID is required'),
  body('recordingOptions')
    .optional()
    .isObject()
    .withMessage('Recording options must be an object')
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

// @route   POST /api/tokens/room
// @desc    Generate LiveKit room access token
// @access  Private
router.post('/room', authenticateToken, roomTokenValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { roomId, participantName } = req.body;

  // Find room
  const room = await Room.findOne({ roomId });
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  // Check if room is active
  if (!room.isActive) {
    return sendErrorResponse(res, {
      message: 'Room is not active',
      statusCode: 400,
      code: 'ROOM_INACTIVE'
    });
  }

  // Check if user is a participant
  const isParticipant = room.isParticipant(req.user._id);
  if (!isParticipant) {
    return sendErrorResponse(res, {
      message: 'You are not a participant in this room',
      statusCode: 403,
      code: 'NOT_PARTICIPANT'
    });
  }

  // Get participant role
  const participant = room.participants.find(p => 
    p.user.toString() === req.user._id.toString() && p.isActive
  );

  // Generate token
  const tokenData = livekitService.generateRoomToken(
    room.roomId,
    participantName || req.user.fullName,
    req.user._id.toString(),
    {
      isAdmin: room.owner.toString() === req.user._id.toString(),
      isModerator: ['owner', 'admin', 'moderator'].includes(participant.role),
      metadata: {
        userId: req.user._id.toString(),
        username: req.user.username,
        avatar: req.user.avatar,
        role: participant.role
      }
    }
  );

  logger.info('Room token generated', {
    userId: req.user._id,
    username: req.user.username,
    roomId: room.roomId,
    roomName: room.name,
    role: participant.role
  });

  sendSuccessResponse(res, {
    token: tokenData.token,
    roomName: tokenData.roomName,
    participantIdentity: tokenData.participantIdentity,
    participantName: tokenData.participantName,
    livekitUrl: tokenData.livekitUrl,
    room: {
      id: room._id,
      roomId: room.roomId,
      name: room.name,
      type: room.type,
      settings: room.settings,
      currentParticipantsCount: room.currentParticipantsCount,
      maxParticipants: room.maxParticipants
    }
  }, 'Room token generated successfully');
}));

// @route   POST /api/tokens/recording
// @desc    Generate LiveKit recording token
// @access  Private (Room owner or admin only)
router.post('/recording', authenticateToken, recordingTokenValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { roomId, recordingOptions = {} } = req.body;

  // Find room
  const room = await Room.findOne({ roomId });
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  // Check if user is owner or admin
  const participant = room.participants.find(p => 
    p.user.toString() === req.user._id.toString() && 
    ['owner', 'admin'].includes(p.role) &&
    p.isActive
  );

  if (!participant) {
    return sendErrorResponse(res, {
      message: 'Only room owners and admins can generate recording tokens',
      statusCode: 403,
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  // Check if recording is enabled for the room
  if (!room.settings.recordingEnabled) {
    return sendErrorResponse(res, {
      message: 'Recording is not enabled for this room',
      statusCode: 400,
      code: 'RECORDING_DISABLED'
    });
  }

  // Generate recording token
  const tokenData = livekitService.generateRecordingToken(room.roomId, {
    metadata: {
      roomId: room.roomId,
      roomName: room.name,
      recordedBy: req.user._id.toString(),
      recordedByUsername: req.user.username,
      ...recordingOptions
    }
  });

  logger.info('Recording token generated', {
    userId: req.user._id,
    username: req.user.username,
    roomId: room.roomId,
    roomName: room.name
  });

  sendSuccessResponse(res, {
    token: tokenData.token,
    roomName: tokenData.roomName,
    livekitUrl: tokenData.livekitUrl,
    recordingOptions
  }, 'Recording token generated successfully');
}));

// @route   POST /api/tokens/admin
// @desc    Generate LiveKit admin token for room management
// @access  Private (Room owner only)
router.post('/admin', authenticateToken, [
  body('roomId')
    .notEmpty()
    .withMessage('Room ID is required')
], handleValidationErrors, asyncHandler(async (req, res) => {
  const { roomId } = req.body;

  // Find room
  const room = await Room.findOne({ roomId });
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  // Check if user is owner
  if (room.owner.toString() !== req.user._id.toString()) {
    return sendErrorResponse(res, {
      message: 'Only room owners can generate admin tokens',
      statusCode: 403,
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  // Generate admin token
  const tokenData = livekitService.generateAdminToken(room.roomId, {
    metadata: {
      roomId: room.roomId,
      roomName: room.name,
      adminUserId: req.user._id.toString(),
      adminUsername: req.user.username
    }
  });

  logger.info('Admin token generated', {
    userId: req.user._id,
    username: req.user.username,
    roomId: room.roomId,
    roomName: room.name
  });

  sendSuccessResponse(res, {
    token: tokenData.token,
    roomName: tokenData.roomName,
    livekitUrl: tokenData.livekitUrl
  }, 'Admin token generated successfully');
}));

// @route   GET /api/tokens/validate
// @desc    Validate a LiveKit token
// @access  Private
router.get('/validate', authenticateToken, asyncHandler(async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return sendErrorResponse(res, {
      message: 'Token is required',
      statusCode: 400,
      code: 'TOKEN_REQUIRED'
    });
  }

  try {
    // This is a basic validation - in a real app, you might want to decode and validate the token
    // For now, we'll just check if it's a valid JWT format
    const jwt = require('jsonwebtoken');
    
    // Try to decode the token (without verification to check format)
    const decoded = jwt.decode(token);
    
    if (!decoded) {
      return sendErrorResponse(res, {
        message: 'Invalid token format',
        statusCode: 400,
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    // Check if token has required fields
    if (!decoded.identity || !decoded.room) {
      return sendErrorResponse(res, {
        message: 'Token missing required fields',
        statusCode: 400,
        code: 'INVALID_TOKEN_CONTENT'
      });
    }

    sendSuccessResponse(res, {
      isValid: true,
      identity: decoded.identity,
      room: decoded.room,
      expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : null
    }, 'Token is valid');

  } catch (error) {
    logger.error('Token validation error:', error);
    return sendErrorResponse(res, {
      message: 'Token validation failed',
      statusCode: 400,
      code: 'TOKEN_VALIDATION_FAILED'
    });
  }
}));

// @route   GET /api/tokens/health
// @desc    Check LiveKit server health
// @access  Private
router.get('/health', authenticateToken, asyncHandler(async (req, res) => {
  try {
    const health = await livekitService.getServerHealth();
    
    sendSuccessResponse(res, {
      livekit: health,
      timestamp: new Date().toISOString()
    }, 'Health check completed');

  } catch (error) {
    logger.error('Health check error:', error);
    return sendErrorResponse(res, {
      message: 'Health check failed',
      statusCode: 500,
      code: 'HEALTH_CHECK_FAILED'
    });
  }
}));

module.exports = router; 