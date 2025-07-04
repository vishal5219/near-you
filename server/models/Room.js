const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    minlength: [3, 'Room name must be at least 3 characters long'],
    maxlength: [100, 'Room name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['public', 'private', 'password-protected'],
    default: 'public'
  },
  password: {
    type: String,
    select: false,
    minlength: [4, 'Password must be at least 4 characters long']
  },
  maxParticipants: {
    type: Number,
    default: 50,
    min: [1, 'Max participants must be at least 1'],
    max: [1000, 'Max participants cannot exceed 1000']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isRecording: {
    type: Boolean,
    default: false
  },
  recordingUrl: {
    type: String,
    default: null
  },
  settings: {
    videoEnabled: {
      type: Boolean,
      default: true
    },
    audioEnabled: {
      type: Boolean,
      default: true
    },
    screenSharingEnabled: {
      type: Boolean,
      default: true
    },
    chatEnabled: {
      type: Boolean,
      default: true
    },
    recordingEnabled: {
      type: Boolean,
      default: false
    },
    videoQuality: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    allowParticipantsToUnmute: {
      type: Boolean,
      default: true
    },
    allowParticipantsToShareScreen: {
      type: Boolean,
      default: true
    },
    allowParticipantsToChat: {
      type: Boolean,
      default: true
    },
    requireApprovalToJoin: {
      type: Boolean,
      default: false
    },
    muteOnEntry: {
      type: Boolean,
      default: false
    },
    videoOffOnEntry: {
      type: Boolean,
      default: false
    }
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'moderator', 'participant'],
      default: 'participant'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    permissions: {
      canMute: {
        type: Boolean,
        default: true
      },
      canUnmute: {
        type: Boolean,
        default: true
      },
      canShareScreen: {
        type: Boolean,
        default: true
      },
      canChat: {
        type: Boolean,
        default: true
      },
      canRecord: {
        type: Boolean,
        default: false
      },
      canKick: {
        type: Boolean,
        default: false
      }
    },
    stats: {
      totalTime: {
        type: Number,
        default: 0
      },
      lastSeen: {
        type: Date,
        default: Date.now
      }
    }
  }],
  invitedUsers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    invitedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending'
    },
    expiresAt: {
      type: Date,
      default: function() {
        return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      }
    }
  }],
  sessions: [{
    sessionId: {
      type: String,
      required: true
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    endedAt: {
      type: Date,
      default: null
    },
    participants: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      joinedAt: {
        type: Date,
        default: Date.now
      },
      leftAt: {
        type: Date,
        default: null
      }
    }],
    recording: {
      isRecording: {
        type: Boolean,
        default: false
      },
      recordingUrl: {
        type: String,
        default: null
      },
      startedAt: {
        type: Date,
        default: null
      },
      endedAt: {
        type: Date,
        default: null
      }
    }
  }],
  stats: {
    totalSessions: {
      type: Number,
      default: 0
    },
    totalParticipants: {
      type: Number,
      default: 0
    },
    totalDuration: {
      type: Number,
      default: 0
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 20
  }],
  category: {
    type: String,
    enum: ['business', 'education', 'social', 'gaming', 'other'],
    default: 'other'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for current participants count
roomSchema.virtual('currentParticipantsCount').get(function() {
  return this.participants.filter(p => p.isActive).length;
});

// Virtual for room status
roomSchema.virtual('status').get(function() {
  if (!this.isActive) return 'inactive';
  if (this.currentParticipantsCount > 0) return 'active';
  return 'empty';
});

// Indexes for better query performance
roomSchema.index({ roomId: 1 });
roomSchema.index({ owner: 1 });
roomSchema.index({ type: 1 });
roomSchema.index({ isActive: 1 });
roomSchema.index({ category: 1 });
roomSchema.index({ 'participants.user': 1 });
roomSchema.index({ createdAt: -1 });

// Pre-save middleware to generate room ID if not provided
roomSchema.pre('save', function(next) {
  if (!this.roomId) {
    this.roomId = this.generateRoomId();
  }
  next();
});

// Instance method to generate unique room ID
roomSchema.methods.generateRoomId = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Instance method to add participant
roomSchema.methods.addParticipant = function(userId, role = 'participant') {
  const existingParticipant = this.participants.find(p => p.user.toString() === userId.toString());
  
  if (existingParticipant) {
    existingParticipant.isActive = true;
    existingParticipant.leftAt = null;
    existingParticipant.stats.lastSeen = new Date();
  } else {
    this.participants.push({
      user: userId,
      role,
      joinedAt: new Date(),
      isActive: true
    });
  }
  
  this.stats.lastActivity = new Date();
  return this.save();
};

// Instance method to remove participant
roomSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => p.user.toString() === userId.toString());
  
  if (participant) {
    participant.isActive = false;
    participant.leftAt = new Date();
    this.stats.lastActivity = new Date();
  }
  
  return this.save();
};

// Instance method to check if user is participant
roomSchema.methods.isParticipant = function(userId) {
  return this.participants.some(p => 
    p.user.toString() === userId.toString() && p.isActive
  );
};

// Instance method to check if user has permission
roomSchema.methods.hasPermission = function(userId, permission) {
  const participant = this.participants.find(p => 
    p.user.toString() === userId.toString() && p.isActive
  );
  
  if (!participant) return false;
  
  if (participant.role === 'owner') return true;
  
  return participant.permissions[permission] || false;
};

// Static method to find active rooms
roomSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

// Static method to find rooms by user
roomSchema.statics.findByUser = function(userId) {
  return this.find({
    'participants.user': userId,
    isActive: true
  }).populate('owner', 'username firstName lastName avatar');
};

// Static method to find public rooms
roomSchema.statics.findPublic = function() {
  return this.find({
    type: 'public',
    isActive: true
  }).populate('owner', 'username firstName lastName avatar');
};

module.exports = mongoose.model('Room', roomSchema); 