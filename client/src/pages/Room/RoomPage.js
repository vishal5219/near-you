import React from 'react';
import { useParams } from 'react-router-dom';
import { useLiveKit } from '../../contexts/LiveKitContext';

const RoomPage = () => {
  const { roomId } = useParams();
  const { room, participants, localParticipant, connectToRoom, disconnectFromRoom } = useLiveKit();

  React.useEffect(() => {
    if (roomId && !room) {
      connectToRoom(roomId);
    }

    return () => {
      if (room) {
        disconnectFromRoom();
      }
    };
  }, [roomId, room, connectToRoom, disconnectFromRoom]);

  if (!room) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Connecting to room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <div className="flex-1 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
          {/* Local participant video */}
          {localParticipant && (
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="aspect-video bg-gray-700 flex items-center justify-center">
                <span className="text-white text-lg">Local Video</span>
              </div>
              <div className="p-4">
                <p className="text-white font-medium">You</p>
              </div>
            </div>
          )}

          {/* Remote participants */}
          {participants.map((participant) => (
            <div key={participant.sid} className="bg-gray-800 rounded-lg overflow-hidden">
              <div className="aspect-video bg-gray-700 flex items-center justify-center">
                <span className="text-white text-lg">Remote Video</span>
              </div>
              <div className="p-4">
                <p className="text-white font-medium">{participant.identity}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-gray-800 p-4">
        <div className="flex justify-center space-x-4">
          <button
            onClick={() => {/* Toggle mute */}}
            className="p-3 bg-gray-700 text-white rounded-full hover:bg-gray-600"
          >
            🎤
          </button>
          <button
            onClick={() => {/* Toggle video */}}
            className="p-3 bg-gray-700 text-white rounded-full hover:bg-gray-600"
          >
            📹
          </button>
          <button
            onClick={disconnectFromRoom}
            className="p-3 bg-red-600 text-white rounded-full hover:bg-red-700"
          >
            📞
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomPage; 