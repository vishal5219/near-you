import React from 'react';

const AdminRoomsPage = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Manage Rooms
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          View and manage video call rooms.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            All Rooms
          </h3>
        </div>
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-300">
            Room management functionality will be implemented here.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminRoomsPage; 