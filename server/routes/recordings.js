const express = require('express');
const { body, validationResult } = require('express-validator');
const Room = require('../models/Room');
const { authenticateToken, requireRoomAccess, requireAdmin } = require('../middleware/auth');
const { asyncHandler, sendSuccessResponse, sendErrorResponse, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const livekitService = require('../services/livekit');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation rules
const startRecordingValidation = [
  body('roomId')
    .notEmpty()
    .withMessage('Room ID is required'),
  body('options')
    .optional()
    .isObject()
    .withMessage('Recording options must be an object')
];

const stopRecordingValidation = [
  body('roomId')
    .notEmpty()
    .withMessage('Room ID is required'),
  body('recordingId')
    .notEmpty()
    .withMessage('Recording ID is required')
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

// @route   POST /api/recordings/start
// @desc    Start recording a room
// @access  Private (Room owner or admin only)
router.post('/start', authenticateToken, startRecordingValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { roomId, options = {} } = req.body;

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
      message: 'Only room owners and admins can start recordings',
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

  // Check if room is already being recorded
  if (room.isRecording) {
    return sendErrorResponse(res, {
      message: 'Room is already being recorded',
      statusCode: 400,
      code: 'ALREADY_RECORDING'
    });
  }

  try {
    // Generate recording token
    const tokenData = livekitService.generateRecordingToken(room.roomId, {
      metadata: {
        roomId: room.roomId,
        roomName: room.name,
        recordedBy: req.user._id.toString(),
        recordedByUsername: req.user.username,
        ...options
      }
    });

    // Update room recording status
    room.isRecording = true;
    room.recordingUrl = null; // Will be updated when recording stops
    await room.save();

    logger.info('Recording started', {
      userId: req.user._id,
      username: req.user.username,
      roomId: room.roomId,
      roomName: room.name,
      options
    });

    sendSuccessResponse(res, {
      recordingId: `recording-${Date.now()}`,
      roomId: room.roomId,
      roomName: room.name,
      token: tokenData.token,
      livekitUrl: tokenData.livekitUrl,
      startedAt: new Date().toISOString(),
      options
    }, 'Recording started successfully');

  } catch (error) {
    logger.error('Failed to start recording:', error);
    return sendErrorResponse(res, {
      message: 'Failed to start recording',
      statusCode: 500,
      code: 'RECORDING_START_FAILED'
    });
  }
}));

// @route   POST /api/recordings/stop
// @desc    Stop recording a room
// @access  Private (Room owner or admin only)
router.post('/stop', authenticateToken, stopRecordingValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { roomId, recordingId } = req.body;

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
      message: 'Only room owners and admins can stop recordings',
      statusCode: 403,
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  // Check if room is being recorded
  if (!room.isRecording) {
    return sendErrorResponse(res, {
      message: 'Room is not being recorded',
      statusCode: 400,
      code: 'NOT_RECORDING'
    });
  }

  try {
    // Stop recording (in a real implementation, you would call LiveKit's stop recording API)
    // For now, we'll just update the room status
    
    // Update room recording status
    room.isRecording = false;
    room.recordingUrl = `https://example.com/recordings/${recordingId}.mp4`; // Placeholder URL
    await room.save();

    logger.info('Recording stopped', {
      userId: req.user._id,
      username: req.user.username,
      roomId: room.roomId,
      roomName: room.name,
      recordingId
    });

    sendSuccessResponse(res, {
      recordingId,
      roomId: room.roomId,
      roomName: room.name,
      recordingUrl: room.recordingUrl,
      stoppedAt: new Date().toISOString()
    }, 'Recording stopped successfully');

  } catch (error) {
    logger.error('Failed to stop recording:', error);
    return sendErrorResponse(res, {
      message: 'Failed to stop recording',
      statusCode: 500,
      code: 'RECORDING_STOP_FAILED'
    });
  }
}));

// @route   GET /api/recordings/room/:roomId
// @desc    Get recordings for a room
// @access  Private (Room participants only)
router.get('/room/:roomId', authenticateToken, requireRoomAccess, asyncHandler(async (req, res) => {
  const { roomId } = req.params;

  const room = await Room.findOne({ roomId });
  if (!room) {
    throw new NotFoundError('Room not found');
  }

  // Get recordings from room sessions
  const recordings = room.sessions
    .filter(session => session.recording.isRecording || session.recording.recordingUrl)
    .map(session => ({
      id: session.sessionId,
      roomId: room.roomId,
      roomName: room.name,
      startedAt: session.recording.startedAt,
      endedAt: session.recording.endedAt,
      recordingUrl: session.recording.recordingUrl,
      isRecording: session.recording.isRecording,
      duration: session.recording.startedAt && session.recording.endedAt 
        ? Math.floor((new Date(session.recording.endedAt) - new Date(session.recording.startedAt)) / 1000)
        : null
    }));

  sendSuccessResponse(res, {
    recordings,
    room: {
      id: room._id,
      roomId: room.roomId,
      name: room.name,
      isRecording: room.isRecording,
      recordingUrl: room.recordingUrl
    }
  }, 'Recordings retrieved successfully');
}));

// @route   GET /api/recordings/:recordingId
// @desc    Get recording details
// @access  Private (Room participants only)
router.get('/:recordingId', authenticateToken, asyncHandler(async (req, res) => {
  const { recordingId } = req.params;

  // Find room that contains this recording
  const room = await Room.findOne({
    'sessions.sessionId': recordingId
  });

  if (!room) {
    throw new NotFoundError('Recording not found');
  }

  // Check if user is a participant
  const isParticipant = room.isParticipant(req.user._id);
  if (!isParticipant) {
    return sendErrorResponse(res, {
      message: 'You do not have access to this recording',
      statusCode: 403,
      code: 'ACCESS_DENIED'
    });
  }

  // Find the specific session/recording
  const session = room.sessions.find(s => s.sessionId === recordingId);
  if (!session) {
    throw new NotFoundError('Recording not found');
  }

  const recording = {
    id: session.sessionId,
    roomId: room.roomId,
    roomName: room.name,
    startedAt: session.recording.startedAt,
    endedAt: session.recording.endedAt,
    recordingUrl: session.recording.recordingUrl,
    isRecording: session.recording.isRecording,
    duration: session.recording.startedAt && session.recording.endedAt 
      ? Math.floor((new Date(session.recording.endedAt) - new Date(session.recording.startedAt)) / 1000)
      : null,
    participants: session.participants.map(p => ({
      user: p.user,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt
    }))
  };

  sendSuccessResponse(res, { recording }, 'Recording details retrieved successfully');
}));

// @route   DELETE /api/recordings/:recordingId
// @desc    Delete a recording
// @access  Private (Room owner or admin only)
router.delete('/:recordingId', authenticateToken, asyncHandler(async (req, res) => {
  const { recordingId } = req.params;

  // Find room that contains this recording
  const room = await Room.findOne({
    'sessions.sessionId': recordingId
  });

  if (!room) {
    throw new NotFoundError('Recording not found');
  }

  // Check if user is owner or admin
  const participant = room.participants.find(p => 
    p.user.toString() === req.user._id.toString() && 
    ['owner', 'admin'].includes(p.role) &&
    p.isActive
  );

  if (!participant) {
    return sendErrorResponse(res, {
      message: 'Only room owners and admins can delete recordings',
      statusCode: 403,
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  // Find and remove the session
  const sessionIndex = room.sessions.findIndex(s => s.sessionId === recordingId);
  if (sessionIndex === -1) {
    throw new NotFoundError('Recording not found');
  }

  // Remove the session
  room.sessions.splice(sessionIndex, 1);
  await room.save();

  logger.info('Recording deleted', {
    userId: req.user._id,
    username: req.user.username,
    roomId: room.roomId,
    roomName: room.name,
    recordingId
  });

  sendSuccessResponse(res, null, 'Recording deleted successfully');
}));

// @route   GET /api/recordings/stats/overview
// @desc    Get recording statistics overview (admin only)
// @access  Private (Admin)
router.get('/stats/overview', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  // Get all rooms with recordings
  const roomsWithRecordings = await Room.find({
    'sessions.recording.recordingUrl': { $exists: true, $ne: null }
  });

  let totalRecordings = 0;
  let totalDuration = 0;
  let activeRecordings = 0;

  roomsWithRecordings.forEach(room => {
    room.sessions.forEach(session => {
      if (session.recording.recordingUrl || session.recording.isRecording) {
        totalRecordings++;
        
        if (session.recording.isRecording) {
          activeRecordings++;
        } else if (session.recording.startedAt && session.recording.endedAt) {
          const duration = Math.floor((new Date(session.recording.endedAt) - new Date(session.recording.startedAt)) / 1000);
          totalDuration += duration;
        }
      }
    });
  });

  // Get recordings from last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let recentRecordings = 0;

  roomsWithRecordings.forEach(room => {
    room.sessions.forEach(session => {
      if (session.recording.startedAt && new Date(session.recording.startedAt) >= thirtyDaysAgo) {
        recentRecordings++;
      }
    });
  });

  sendSuccessResponse(res, {
    stats: {
      totalRecordings,
      totalDuration, // in seconds
      activeRecordings,
      recentRecordings,
      averageDuration: totalRecordings > 0 ? Math.floor(totalDuration / totalRecordings) : 0
    }
  }, 'Recording statistics retrieved successfully');
}));

module.exports = router; 