const { AccessToken } = require('livekit-server-sdk');
const { logger } = require('../utils/logger');

class LiveKitService {
  constructor() {
    this.apiKey = process.env.LIVEKIT_API_KEY;
    this.apiSecret = process.env.LIVEKIT_API_SECRET;
    this.livekitUrl = process.env.LIVEKIT_URL;

    if (!this.apiKey || !this.apiSecret || !this.livekitUrl) {
      logger.error('LiveKit configuration missing. Please check environment variables.');
      throw new Error('LiveKit configuration incomplete');
    }
  }

  // Generate access token for room participation
  generateRoomToken(roomName, participantName, participantIdentity, options = {}) {
    try {
      const at = new AccessToken(this.apiKey, this.apiSecret, {
        identity: participantIdentity,
        name: participantName,
      });

      // Grant permissions based on role
      const {
        canPublish = true,
        canSubscribe = true,
        canPublishData = true,
        canUpdateMetadata = true,
        isAdmin = false,
        isModerator = false
      } = options;

      // Add room grant
      at.addGrant({
        room: roomName,
        roomJoin: true,
        roomAdmin: isAdmin,
        roomCreate: isAdmin,
        canPublish,
        canSubscribe,
        canPublishData,
        canUpdateMetadata,
        canPublishSources: ['camera', 'microphone', 'screen_share'],
        canSubscribeSources: ['camera', 'microphone', 'screen_share'],
        metadata: JSON.stringify({
          role: isAdmin ? 'admin' : isModerator ? 'moderator' : 'participant',
          ...options.metadata
        })
      });

      const token = at.toJwt();
      
      logger.info('Generated LiveKit token', {
        roomName,
        participantIdentity,
        role: isAdmin ? 'admin' : isModerator ? 'moderator' : 'participant'
      });

      return {
        token,
        roomName,
        participantIdentity,
        participantName,
        livekitUrl: this.livekitUrl
      };

    } catch (error) {
      logger.error('Error generating LiveKit token:', error);
      throw new Error('Failed to generate access token');
    }
  }

  // Generate recording token
  generateRecordingToken(roomName, options = {}) {
    try {
      const at = new AccessToken(this.apiKey, this.apiSecret, {
        identity: `recorder-${Date.now()}`,
        name: 'Recording Service',
      });

      at.addGrant({
        room: roomName,
        roomJoin: true,
        roomAdmin: true,
        canPublish: false,
        canSubscribe: true,
        canPublishData: false,
        canUpdateMetadata: false,
        canPublishSources: [],
        canSubscribeSources: ['camera', 'microphone', 'screen_share'],
        metadata: JSON.stringify({
          role: 'recorder',
          ...options.metadata
        })
      });

      const token = at.toJwt();
      
      logger.info('Generated LiveKit recording token', { roomName });

      return {
        token,
        roomName,
        livekitUrl: this.livekitUrl
      };

    } catch (error) {
      logger.error('Error generating LiveKit recording token:', error);
      throw new Error('Failed to generate recording token');
    }
  }

  // Generate admin token for room management
  generateAdminToken(roomName, options = {}) {
    try {
      const at = new AccessToken(this.apiKey, this.apiSecret, {
        identity: `admin-${Date.now()}`,
        name: 'Room Administrator',
      });

      at.addGrant({
        room: roomName,
        roomJoin: true,
        roomAdmin: true,
        roomCreate: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateMetadata: true,
        canPublishSources: ['camera', 'microphone', 'screen_share'],
        canSubscribeSources: ['camera', 'microphone', 'screen_share'],
        metadata: JSON.stringify({
          role: 'admin',
          ...options.metadata
        })
      });

      const token = at.toJwt();
      
      logger.info('Generated LiveKit admin token', { roomName });

      return {
        token,
        roomName,
        livekitUrl: this.livekitUrl
      };

    } catch (error) {
      logger.error('Error generating LiveKit admin token:', error);
      throw new Error('Failed to generate admin token');
    }
  }

  // Validate room name format
  validateRoomName(roomName) {
    if (!roomName || typeof roomName !== 'string') {
      return false;
    }
    
    // Room name should be alphanumeric with hyphens and underscores
    const roomNameRegex = /^[a-zA-Z0-9_-]+$/;
    return roomNameRegex.test(roomName) && roomName.length <= 64;
  }

  // Validate participant identity
  validateParticipantIdentity(identity) {
    if (!identity || typeof identity !== 'string') {
      return false;
    }
    
    // Identity should be alphanumeric with hyphens and underscores
    const identityRegex = /^[a-zA-Z0-9_-]+$/;
    return identityRegex.test(identity) && identity.length <= 64;
  }

  // Get room configuration based on room type and settings
  getRoomConfiguration(roomSettings = {}) {
    const {
      maxParticipants = 50,
      videoQuality = 'medium',
      recordingEnabled = false,
      chatEnabled = true,
      screenSharingEnabled = true
    } = roomSettings;

    return {
      maxParticipants,
      videoQuality,
      recordingEnabled,
      chatEnabled,
      screenSharingEnabled,
      // LiveKit specific settings
      emptyTimeout: 10 * 60, // 10 minutes
      maxDuration: 24 * 60 * 60, // 24 hours
      nodeIP: undefined, // Let LiveKit choose
      metadata: JSON.stringify({
        videoQuality,
        recordingEnabled,
        chatEnabled,
        screenSharingEnabled
      })
    };
  }

  // Create room metadata for tracking
  createRoomMetadata(room, user) {
    return {
      roomId: room.roomId,
      roomName: room.name,
      roomType: room.type,
      ownerId: room.owner.toString(),
      ownerName: user.fullName,
      createdAt: room.createdAt,
      maxParticipants: room.maxParticipants,
      settings: room.settings
    };
  }

  // Parse participant metadata
  parseParticipantMetadata(metadata) {
    try {
      return JSON.parse(metadata);
    } catch (error) {
      logger.warn('Failed to parse participant metadata:', error);
      return {};
    }
  }

  // Get LiveKit server health
  async getServerHealth() {
    try {
      const response = await fetch(`${this.livekitUrl}/health`);
      if (response.ok) {
        const health = await response.json();
        return {
          status: 'healthy',
          ...health
        };
      } else {
        return {
          status: 'unhealthy',
          error: `HTTP ${response.status}`
        };
      }
    } catch (error) {
      logger.error('LiveKit health check failed:', error);
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Get room information from LiveKit
  async getRoomInfo(roomName) {
    try {
      const response = await fetch(`${this.livekitUrl}/twirp/livekit.RoomService/ListRooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.generateAdminToken(roomName).token}`
        },
        body: JSON.stringify({})
      });

      if (response.ok) {
        const data = await response.json();
        return data.rooms?.find(room => room.name === roomName) || null;
      } else {
        logger.error('Failed to get room info:', response.status);
        return null;
      }
    } catch (error) {
      logger.error('Error getting room info:', error);
      return null;
    }
  }

  // Delete room from LiveKit
  async deleteRoom(roomName) {
    try {
      const response = await fetch(`${this.livekitUrl}/twirp/livekit.RoomService/DeleteRoom`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.generateAdminToken(roomName).token}`
        },
        body: JSON.stringify({
          room: roomName
        })
      });

      if (response.ok) {
        logger.info('Room deleted from LiveKit:', roomName);
        return true;
      } else {
        logger.error('Failed to delete room:', response.status);
        return false;
      }
    } catch (error) {
      logger.error('Error deleting room:', error);
      return false;
    }
  }
}

// Create singleton instance
const livekitService = new LiveKitService();

module.exports = livekitService; 