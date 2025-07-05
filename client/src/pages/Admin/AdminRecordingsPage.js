import React from 'react';

const AdminRecordingsPage = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Manage Recordings
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          View and manage video call recordings.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            All Recordings
          </h3>
        </div>
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-300">
            Recording management functionality will be implemented here.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminRecordingsPage; 