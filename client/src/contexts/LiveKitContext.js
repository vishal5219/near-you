import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { Room, RoomEvent, RemoteParticipant, LocalParticipant, Track, TrackPublication, RemoteTrackPublication } from 'livekit-client';
import { useAuth } from './AuthContext';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';

// Initial state
const initialState = {
  room: null,
  isConnecting: false,
  isConnected: false,
  participants: [],
  localParticipant: null,
  audioEnabled: true,
  videoEnabled: true,
  screenShareEnabled: false,
  isRecording: false,
  error: null,
  roomToken: null,
  roomData: null,
};

// Action types
const LIVEKIT_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_ROOM: 'SET_ROOM',
  SET_CONNECTING: 'SET_CONNECTING',
  SET_CONNECTED: 'SET_CONNECTED',
  SET_PARTICIPANTS: 'SET_PARTICIPANTS',
  SET_LOCAL_PARTICIPANT: 'SET_LOCAL_PARTICIPANT',
  ADD_PARTICIPANT: 'ADD_PARTICIPANT',
  REMOVE_PARTICIPANT: 'REMOVE_PARTICIPANT',
  UPDATE_PARTICIPANT: 'UPDATE_PARTICIPANT',
  SET_AUDIO_ENABLED: 'SET_AUDIO_ENABLED',
  SET_VIDEO_ENABLED: 'SET_VIDEO_ENABLED',
  SET_SCREEN_SHARE_ENABLED: 'SET_SCREEN_SHARE_ENABLED',
  SET_RECORDING: 'SET_RECORDING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_ROOM_TOKEN: 'SET_ROOM_TOKEN',
  SET_ROOM_DATA: 'SET_ROOM_DATA',
  RESET: 'RESET',
};

// Reducer
function livekitReducer(state, action) {
  switch (action.type) {
    case LIVEKIT_ACTIONS.SET_LOADING:
      return {
        ...state,
        isConnecting: action.payload,
      };
    case LIVEKIT_ACTIONS.SET_ROOM:
      return {
        ...state,
        room: action.payload,
      };
    case LIVEKIT_ACTIONS.SET_CONNECTING:
      return {
        ...state,
        isConnecting: action.payload,
      };
    case LIVEKIT_ACTIONS.SET_CONNECTED:
      return {
        ...state,
        isConnected: action.payload,
      };
    case LIVEKIT_ACTIONS.SET_PARTICIPANTS:
      return {
        ...state,
        participants: action.payload,
      };
    case LIVEKIT_ACTIONS.SET_LOCAL_PARTICIPANT:
      return {
        ...state,
        localParticipant: action.payload,
      };
    case LIVEKIT_ACTIONS.ADD_PARTICIPANT:
      return {
        ...state,
        participants: [...state.participants, action.payload],
      };
    case LIVEKIT_ACTIONS.REMOVE_PARTICIPANT:
      return {
        ...state,
        participants: state.participants.filter(p => p.identity !== action.payload),
      };
    case LIVEKIT_ACTIONS.UPDATE_PARTICIPANT:
      return {
        ...state,
        participants: state.participants.map(p =>
          p.identity === action.payload.identity ? { ...p, ...action.payload } : p
        ),
      };
    case LIVEKIT_ACTIONS.SET_AUDIO_ENABLED:
      return {
        ...state,
        audioEnabled: action.payload,
      };
    case LIVEKIT_ACTIONS.SET_VIDEO_ENABLED:
      return {
        ...state,
        videoEnabled: action.payload,
      };
    case LIVEKIT_ACTIONS.SET_SCREEN_SHARE_ENABLED:
      return {
        ...state,
        screenShareEnabled: action.payload,
      };
    case LIVEKIT_ACTIONS.SET_RECORDING:
      return {
        ...state,
        isRecording: action.payload,
      };
    case LIVEKIT_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
      };
    case LIVEKIT_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };
    case LIVEKIT_ACTIONS.SET_ROOM_TOKEN:
      return {
        ...state,
        roomToken: action.payload,
      };
    case LIVEKIT_ACTIONS.SET_ROOM_DATA:
      return {
        ...state,
        roomData: action.payload,
      };
    case LIVEKIT_ACTIONS.RESET:
      return {
        ...initialState,
      };
    default:
      return state;
  }
}

// Create context
const LiveKitContext = createContext();

// Provider component
export function LiveKitProvider({ children }) {
  const [state, dispatch] = useReducer(livekitReducer, initialState);
  const { user } = useAuth();

  // Get room token
  const getRoomToken = useCallback(async (roomId, participantName = null) => {
    try {
      const response = await apiService.tokens.getRoomToken({
        roomId,
        participantName: participantName || user?.fullName,
      });
      
      const { token, room } = response.data.data;
      dispatch({ type: LIVEKIT_ACTIONS.SET_ROOM_TOKEN, payload: token });
      dispatch({ type: LIVEKIT_ACTIONS.SET_ROOM_DATA, payload: room });
      
      return { token, room };
    } catch (error) {
      console.error('Failed to get room token:', error);
      throw error;
    }
  }, [user]);

  // Connect to room
  const connectToRoom = useCallback(async (roomId, participantName = null) => {
    try {
      dispatch({ type: LIVEKIT_ACTIONS.SET_CONNECTING, payload: true });
      dispatch({ type: LIVEKIT_ACTIONS.CLEAR_ERROR });

      // Get room token
      const { token, room } = await getRoomToken(roomId, participantName);

      // Create room instance
      const livekitRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: {
          simulcast: true,
        },
      });

      // Set up room event listeners
      setupRoomEventListeners(livekitRoom);

      // Connect to room
      await livekitRoom.connect(room.livekitUrl, token, {
        autoSubscribe: true,
      });

      dispatch({ type: LIVEKIT_ACTIONS.SET_ROOM, payload: livekitRoom });
      dispatch({ type: LIVEKIT_ACTIONS.SET_CONNECTED, payload: true });
      dispatch({ type: LIVEKIT_ACTIONS.SET_CONNECTING, payload: false });

      toast.success('Connected to room successfully!');

      return livekitRoom;
    } catch (error) {
      console.error('Failed to connect to room:', error);
      dispatch({ type: LIVEKIT_ACTIONS.SET_ERROR, payload: error.message });
      dispatch({ type: LIVEKIT_ACTIONS.SET_CONNECTING, payload: false });
      toast.error('Failed to connect to room');
      throw error;
    }
  }, [getRoomToken]);

  // Disconnect from room
  const disconnectFromRoom = useCallback(async () => {
    if (state.room) {
      try {
        await state.room.disconnect();
        dispatch({ type: LIVEKIT_ACTIONS.RESET });
        toast.success('Disconnected from room');
      } catch (error) {
        console.error('Error disconnecting from room:', error);
      }
    }
  }, [state.room]);

  // Setup room event listeners
  const setupRoomEventListeners = useCallback((room) => {
    // Participant connected
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log('Participant connected:', participant.identity);
      dispatch({ type: LIVEKIT_ACTIONS.ADD_PARTICIPANT, payload: participant });
      toast.success(`${participant.name || participant.identity} joined the room`);
    });

    // Participant disconnected
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log('Participant disconnected:', participant.identity);
      dispatch({ type: LIVEKIT_ACTIONS.REMOVE_PARTICIPANT, payload: participant.identity });
      toast.info(`${participant.name || participant.identity} left the room`);
    });

    // Local participant connected
    room.on(RoomEvent.LocalParticipantConnected, (participant) => {
      console.log('Local participant connected:', participant.identity);
      dispatch({ type: LIVEKIT_ACTIONS.SET_LOCAL_PARTICIPANT, payload: participant });
    });

    // Track published
    room.on(RoomEvent.TrackPublished, (publication, participant) => {
      console.log('Track published:', publication.trackSid, 'by', participant.identity);
      updateParticipantTracks(participant);
    });

    // Track unpublished
    room.on(RoomEvent.TrackUnpublished, (publication, participant) => {
      console.log('Track unpublished:', publication.trackSid, 'by', participant.identity);
      updateParticipantTracks(participant);
    });

    // Track subscribed
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.log('Track subscribed:', track.sid, 'from', participant.identity);
      updateParticipantTracks(participant);
    });

    // Track unsubscribed
    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      console.log('Track unsubscribed:', track.sid, 'from', participant.identity);
      updateParticipantTracks(participant);
    });

    // Connection state changed
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      console.log('Connection state changed:', state);
      dispatch({ type: LIVEKIT_ACTIONS.SET_CONNECTED, payload: state === 'connected' });
      
      if (state === 'disconnected') {
        toast.info('Disconnected from room');
      } else if (state === 'reconnecting') {
        toast.warning('Reconnecting to room...');
      }
    });

    // Room metadata changed
    room.on(RoomEvent.MetadataChanged, (metadata) => {
      console.log('Room metadata changed:', metadata);
    });

    // Data received
    room.on(RoomEvent.DataReceived, (payload, participant) => {
      console.log('Data received:', payload, 'from', participant.identity);
    });

    // Active speakers changed
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      console.log('Active speakers changed:', speakers.map(s => s.identity));
    });

    // Recording started
    room.on(RoomEvent.RecordingStarted, () => {
      console.log('Recording started');
      dispatch({ type: LIVEKIT_ACTIONS.SET_RECORDING, payload: true });
      toast.info('Recording started');
    });

    // Recording stopped
    room.on(RoomEvent.RecordingStopped, () => {
      console.log('Recording stopped');
      dispatch({ type: LIVEKIT_ACTIONS.SET_RECORDING, payload: false });
      toast.info('Recording stopped');
    });
  }, []);

  // Update participant tracks
  const updateParticipantTracks = useCallback((participant) => {
    const audioTrack = participant.getTrack(Track.Source.Microphone);
    const videoTrack = participant.getTrack(Track.Source.Camera);
    const screenShareTrack = participant.getTrack(Track.Source.ScreenShare);

    dispatch({
      type: LIVEKIT_ACTIONS.UPDATE_PARTICIPANT,
      payload: {
        identity: participant.identity,
        audioTrack: audioTrack?.isSubscribed ? audioTrack : null,
        videoTrack: videoTrack?.isSubscribed ? videoTrack : null,
        screenShareTrack: screenShareTrack?.isSubscribed ? screenShareTrack : null,
        isAudioEnabled: audioTrack?.isMuted === false,
        isVideoEnabled: videoTrack?.isMuted === false,
        isScreenSharing: !!screenShareTrack?.isSubscribed,
      },
    });
  }, []);

  // Toggle audio
  const toggleAudio = useCallback(async () => {
    if (state.localParticipant) {
      try {
        if (state.audioEnabled) {
          await state.localParticipant.setMicrophoneEnabled(false);
          dispatch({ type: LIVEKIT_ACTIONS.SET_AUDIO_ENABLED, payload: false });
          toast.info('Microphone muted');
        } else {
          await state.localParticipant.setMicrophoneEnabled(true);
          dispatch({ type: LIVEKIT_ACTIONS.SET_AUDIO_ENABLED, payload: true });
          toast.info('Microphone unmuted');
        }
      } catch (error) {
        console.error('Error toggling audio:', error);
        toast.error('Failed to toggle microphone');
      }
    }
  }, [state.localParticipant, state.audioEnabled]);

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (state.localParticipant) {
      try {
        if (state.videoEnabled) {
          await state.localParticipant.setCameraEnabled(false);
          dispatch({ type: LIVEKIT_ACTIONS.SET_VIDEO_ENABLED, payload: false });
          toast.info('Camera turned off');
        } else {
          await state.localParticipant.setCameraEnabled(true);
          dispatch({ type: LIVEKIT_ACTIONS.SET_VIDEO_ENABLED, payload: true });
          toast.info('Camera turned on');
        }
      } catch (error) {
        console.error('Error toggling video:', error);
        toast.error('Failed to toggle camera');
      }
    }
  }, [state.localParticipant, state.videoEnabled]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (state.localParticipant) {
      try {
        if (state.screenShareEnabled) {
          await state.localParticipant.setScreenShareEnabled(false);
          dispatch({ type: LIVEKIT_ACTIONS.SET_SCREEN_SHARE_ENABLED, payload: false });
          toast.info('Screen sharing stopped');
        } else {
          await state.localParticipant.setScreenShareEnabled(true);
          dispatch({ type: LIVEKIT_ACTIONS.SET_SCREEN_SHARE_ENABLED, payload: true });
          toast.info('Screen sharing started');
        }
      } catch (error) {
        console.error('Error toggling screen share:', error);
        toast.error('Failed to toggle screen sharing');
      }
    }
  }, [state.localParticipant, state.screenShareEnabled]);

  // Start recording
  const startRecording = useCallback(async (roomId) => {
    try {
      await apiService.recordings.start({ roomId });
      toast.success('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording');
    }
  }, []);

  // Stop recording
  const stopRecording = useCallback(async (roomId, recordingId) => {
    try {
      await apiService.recordings.stop({ roomId, recordingId });
      toast.success('Recording stopped');
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast.error('Failed to stop recording');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (state.room) {
        state.room.disconnect();
      }
    };
  }, [state.room]);

  // Value object
  const value = {
    // State
    room: state.room,
    isConnecting: state.isConnecting,
    isConnected: state.isConnected,
    participants: state.participants,
    localParticipant: state.localParticipant,
    audioEnabled: state.audioEnabled,
    videoEnabled: state.videoEnabled,
    screenShareEnabled: state.screenShareEnabled,
    isRecording: state.isRecording,
    error: state.error,
    roomToken: state.roomToken,
    roomData: state.roomData,

    // Functions
    connectToRoom,
    disconnectFromRoom,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    startRecording,
    stopRecording,
    getRoomToken,
  };

  return (
    <LiveKitContext.Provider value={value}>
      {children}
    </LiveKitContext.Provider>
  );
}

// Custom hook to use LiveKit context
export function useLiveKit() {
  const context = useContext(LiveKitContext);
  if (!context) {
    throw new Error('useLiveKit must be used within a LiveKitProvider');
  }
  return context;
}

// Custom hook for room connection
export function useRoomConnection() {
  const { isConnecting, isConnected, connectToRoom, disconnectFromRoom } = useLiveKit();
  return { isConnecting, isConnected, connectToRoom, disconnectFromRoom };
}

// Custom hook for media controls
export function useMediaControls() {
  const { audioEnabled, videoEnabled, screenShareEnabled, toggleAudio, toggleVideo, toggleScreenShare } = useLiveKit();
  return { audioEnabled, videoEnabled, screenShareEnabled, toggleAudio, toggleVideo, toggleScreenShare };
}

// Custom hook for participants
export function useParticipants() {
  const { participants, localParticipant } = useLiveKit();
  return { participants, localParticipant };
} 