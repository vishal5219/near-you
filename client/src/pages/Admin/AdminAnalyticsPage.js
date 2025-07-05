import React from 'react';

const AdminAnalyticsPage = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Analytics & Reports
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          View system analytics and generate reports.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            System Analytics
          </h3>
        </div>
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-300">
            Analytics and reporting functionality will be implemented here.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalyticsPage; 