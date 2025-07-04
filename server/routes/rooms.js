const express = require('express');
const { body, validationResult } = require('express-validator');
const Room = require('../models/Room');
const User = require('../models/User');
const { authenticateToken, requireRoomAccess, requireRoomPermission } = require('../middleware/auth');
const { asyncHandler, sendSuccessResponse, sendErrorResponse, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const livekitService = require('../services/livekit');
const { setCache, getCache, deleteCache } = require('../config/redis');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation rules
const createRoomValidation = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Room name must be between 3 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('type')
    .optional()
    .isIn(['public', 'private', 'password-protected'])
    .withMessage('Room type must be public, private, or password-protected'),
  body('password')
    .optional()
    .isLength({ min: 4 })
    .withMessage('Password must be at least 4 characters long'),
  body('maxParticipants')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Max participants must be between 1 and 1000'),
  body('category')
    .optional()
    .isIn(['business', 'education', 'social', 'gaming', 'other'])
    .withMessage('Invalid category'),
  body('tags')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Tags must be an array with maximum 10 items'),
  body('settings')
    .optional()
    .isObject()
    .withMessage('Settings must be an object')
];

const joinRoomValidation = [
  body('password')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Password is required for password-protected rooms')
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

// @route   POST /api/rooms
// @desc    Create a new room
// @access  Private
router.post('/', authenticateToken, createRoomValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const {
    name,
    description,
    type = 'public',
    password,
    maxParticipants = 50,
    category = 'other',
    tags = [],
    settings = {}
  } = req.body;

  // Validate room name format for LiveKit
  if (!livekitService.validateRoomName(name)) {
    return sendErrorResponse(res, {
      message: 'Invalid room name format',
      statusCode: 400,
      code: 'INVALID_ROOM_NAME'
    });
  }

  // Check if room name already exists
  const existingRoom = await Room.findOne({ name });
  if (existingRoom) {
    return sendErrorResponse(res, {
      message: 'Room name already exists',
      statusCode: 400,
      code: 'ROOM_NAME_EXISTS'
    });
  }

  // Create room
  const room = new Room({
    name,
    description,
    type,
    password: type === 'password-protected' ? password : undefined,
    maxParticipants,
    category,
    tags,
    owner: req.user._id,
    settings: {
      ...settings,
      videoEnabled: settings.videoEnabled !== false,
      audioEnabled: settings.audioEnabled !== false,
      screenSharingEnabled: settings.screenSharingEnabled !== false,
      chatEnabled: settings.chatEnabled !== false,
      recordingEnabled: settings.recordingEnabled || false
    }
  });

  await room.save();

  // Add owner as participant
  await room.addParticipant(req.user._id, 'owner');

  // Cache room data
  await setCache(`room:${room.roomId}`, {
    id: room._id,
    roomId: room.roomId,
    name: room.name,
    type: room.type,
    owner: room.owner,
    maxParticipants: room.maxParticipants,
    settings: room.settings
  }, 60 * 60); // 1 hour

  logger.info('Room created successfully', {
    roomId: room.roomId,
    roomName: room.name,
    ownerId: req.user._id,
    ownerName: req.user.username
  });

  sendSuccessResponse(res, {
    room: {
      id: room._id,
      roomId: room.roomId,
      name: room.name,
      description: room.description,
      type: room.type,
      maxParticipants: room.maxParticipants,
      category: room.category,
      tags: room.tags,
      settings: room.settings,
      owner: {
        id: req.user._id,
        username: req.user.username,
        fullName: req.user.fullName,
        avatar: req.user.avatar
      },
      currentParticipantsCount: room.currentParticipantsCount,
      status: room.status,
      createdAt: room.createdAt
    }
  }, 'Room created successfully', 201);
}));

// @route   GET /api/rooms
// @desc    Get user's rooms and public rooms
// @access  Private
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const { type = 'all', page = 1, limit = 10, category } = req.query;
  const skip = (page - 1) * limit;

  let rooms = [];
  let total = 0;

  if (type === 'my' || type === 'all') {
    // Get user's rooms
    const userRooms = await Room.findByUser(req.user._id)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ updatedAt: -1 });

    rooms = rooms.concat(userRooms);
    total += await Room.countDocuments({
      'participants.user': req.user._id,
      isActive: true
    });
  }

  if (type === 'public' || type === 'all') {
    // Get public rooms
    const publicRooms = await Room.findPublic()
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    rooms = rooms.concat(publicRooms);
    total += await Room.countDocuments({
      type: 'public',
      isActive: true
    });
  }

  // Remove duplicates and sort
  const uniqueRooms = rooms.filter((room, index, self) => 
    index === self.findIndex(r => r._id.toString() === room._id.toString())
  );

  sendSuccessResponse(res, {
    rooms: uniqueRooms.map(room => ({
      id: room._id,
      roomId: room.roomId,
      name: room.name,
      description: room.description,
      type: room.type,
      category: room.category,
      tags: room.tags,
      maxParticipants: room.maxParticipants,
      currentParticipantsCount: room.currentParticipantsCount,
      status: room.status,
      owner: room.owner,
      settings: room.settings,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  }, 'Rooms retrieved successfully');
}));

// @route   GET /api/rooms/:roomId
// @desc    Get room details
// @access  Private
router.get('/:roomId', authenticateToken, asyncHandler(async (req, res) => {
  const { roomId } = req.params;

  // Try to get from cache first
  let roomData = await getCache(`room:${roomId}`);
  
  if (!roomData) {
    const room = await Room.findOne({ roomId })
      .populate('owner', 'username firstName lastName avatar')
      .populate('participants.user', 'username firstName lastName avatar');

    if (!room) {
      throw new NotFoundError('Room not found');
    }

    roomData = {
      id: room._id,
      roomId: room.roomId,
      name: room.name,
      description: room.description,
      type: room.type,
      category: room.category,
      tags: room.tags,
      maxParticipants: room.maxParticipants,
      currentParticipantsCount: room.currentParticipantsCount,
      status: room.status,
      owner: room.owner,
      settings: room.settings,
      participants: room.participants.filter(p => p.isActive).map(p => ({
        user: p.user,
        role: p.role,
        joinedAt: p.joinedAt,
        permissions: p.permissions
      })),
      stats: room.stats,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt
    };

    // Cache room data
    await setCache(`room:${roomId}`, roomData, 60 * 60); // 1 hour
  }

  sendSuccessResponse(res, { room: roomData }, 'Room details retrieved successfully');
}));

// @route   POST /api/rooms/:roomId/join
// @desc    Join a room
// @access  Private
router.post('/:roomId/join', authenticateToken, joinRoomValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { password } = req.body;

  const room = await Room.findOne({ roomId });
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  if (!room.isActive) {
    return sendErrorResponse(res, {
      message: 'Room is not active',
      statusCode: 400,
      code: 'ROOM_INACTIVE'
    });
  }

  // Check room capacity
  if (room.currentParticipantsCount >= room.maxParticipants) {
    return sendErrorResponse(res, {
      message: 'Room is at maximum capacity',
      statusCode: 400,
      code: 'ROOM_FULL'
    });
  }

  // Check password for password-protected rooms
  if (room.type === 'password-protected') {
    if (!password) {
      return sendErrorResponse(res, {
        message: 'Password is required for this room',
        statusCode: 400,
        code: 'PASSWORD_REQUIRED'
      });
    }

    const isPasswordValid = await room.comparePassword(password);
    if (!isPasswordValid) {
      return sendErrorResponse(res, {
        message: 'Incorrect password',
        statusCode: 400,
        code: 'INVALID_PASSWORD'
      });
    }
  }

  // Check if user is already a participant
  const isParticipant = room.isParticipant(req.user._id);
  if (!isParticipant) {
    // Add user as participant
    await room.addParticipant(req.user._id, 'participant');
  }

  // Generate LiveKit token
  const tokenData = livekitService.generateRoomToken(
    room.roomId,
    req.user.fullName,
    req.user._id.toString(),
    {
      isAdmin: room.owner.toString() === req.user._id.toString(),
      isModerator: room.participants.find(p => 
        p.user.toString() === req.user._id.toString() && 
        ['owner', 'admin', 'moderator'].includes(p.role)
      ) !== undefined,
      metadata: {
        userId: req.user._id.toString(),
        username: req.user.username,
        avatar: req.user.avatar
      }
    }
  );

  // Clear room cache
  await deleteCache(`room:${roomId}`);

  logger.info('User joined room', {
    userId: req.user._id,
    username: req.user.username,
    roomId: room.roomId,
    roomName: room.name
  });

  sendSuccessResponse(res, {
    room: {
      id: room._id,
      roomId: room.roomId,
      name: room.name,
      description: room.description,
      type: room.type,
      settings: room.settings,
      currentParticipantsCount: room.currentParticipantsCount,
      maxParticipants: room.maxParticipants
    },
    token: tokenData.token,
    livekitUrl: tokenData.livekitUrl
  }, 'Joined room successfully');
}));

// @route   POST /api/rooms/:roomId/leave
// @desc    Leave a room
// @access  Private
router.post('/:roomId/leave', authenticateToken, asyncHandler(async (req, res) => {
  const { roomId } = req.params;

  const room = await Room.findOne({ roomId });
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  // Remove user from participants
  await room.removeParticipant(req.user._id);

  // Clear room cache
  await deleteCache(`room:${roomId}`);

  logger.info('User left room', {
    userId: req.user._id,
    username: req.user.username,
    roomId: room.roomId,
    roomName: room.name
  });

  sendSuccessResponse(res, null, 'Left room successfully');
}));

// @route   PUT /api/rooms/:roomId
// @desc    Update room settings
// @access  Private (Room owner or admin)
router.put('/:roomId', authenticateToken, requireRoomAccess, asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { name, description, settings, maxParticipants, category, tags } = req.body;

  const room = await Room.findOne({ roomId });
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  // Check if user is owner or admin
  const participant = room.participants.find(p => 
    p.user.toString() === req.user._id.toString() && 
    ['owner', 'admin'].includes(p.role)
  );

  if (!participant) {
    return sendErrorResponse(res, {
      message: 'Only room owners and admins can update room settings',
      statusCode: 403,
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  // Update room fields
  if (name) room.name = name;
  if (description !== undefined) room.description = description;
  if (maxParticipants) room.maxParticipants = maxParticipants;
  if (category) room.category = category;
  if (tags) room.tags = tags;
  if (settings) {
    room.settings = { ...room.settings, ...settings };
  }

  await room.save();

  // Clear room cache
  await deleteCache(`room:${roomId}`);

  logger.info('Room updated', {
    roomId: room.roomId,
    roomName: room.name,
    updatedBy: req.user._id,
    updatedByUsername: req.user.username
  });

  sendSuccessResponse(res, {
    room: {
      id: room._id,
      roomId: room.roomId,
      name: room.name,
      description: room.description,
      type: room.type,
      category: room.category,
      tags: room.tags,
      maxParticipants: room.maxParticipants,
      settings: room.settings,
      currentParticipantsCount: room.currentParticipantsCount,
      status: room.status,
      updatedAt: room.updatedAt
    }
  }, 'Room updated successfully');
}));

// @route   DELETE /api/rooms/:roomId
// @desc    Delete a room
// @access  Private (Room owner only)
router.delete('/:roomId', authenticateToken, requireRoomAccess, asyncHandler(async (req, res) => {
  const { roomId } = req.params;

  const room = await Room.findOne({ roomId });
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  // Check if user is owner
  if (room.owner.toString() !== req.user._id.toString()) {
    return sendErrorResponse(res, {
      message: 'Only room owners can delete rooms',
      statusCode: 403,
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  // Delete room from LiveKit
  await livekitService.deleteRoom(room.roomId);

  // Delete room from database
  await Room.findByIdAndDelete(room._id);

  // Clear room cache
  await deleteCache(`room:${roomId}`);

  logger.info('Room deleted', {
    roomId: room.roomId,
    roomName: room.name,
    deletedBy: req.user._id,
    deletedByUsername: req.user.username
  });

  sendSuccessResponse(res, null, 'Room deleted successfully');
}));

module.exports = router; 