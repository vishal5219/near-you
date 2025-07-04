import axios from 'axios';
import toast from 'react-hot-toast';

// Create axios instance
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add request timestamp for debugging
    config.metadata = { startTime: new Date() };

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    // Log response time for debugging
    const endTime = new Date();
    const startTime = response.config.metadata?.startTime;
    if (startTime) {
      const duration = endTime.getTime() - startTime.getTime();
      console.log(`API Request: ${response.config.method?.toUpperCase()} ${response.config.url} - ${duration}ms`);
    }

    return response;
  },
  (error) => {
    // Log error details
    const endTime = new Date();
    const startTime = error.config?.metadata?.startTime;
    if (startTime) {
      const duration = endTime.getTime() - startTime.getTime();
      console.error(`API Error: ${error.config.method?.toUpperCase()} ${error.config.url} - ${duration}ms`, error);
    }

    // Handle different error types
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          // Unauthorized - clear token and redirect to login
          localStorage.removeItem('token');
          window.location.href = '/login';
          break;
        
        case 403:
          // Forbidden - show access denied message
          toast.error('Access denied. You do not have permission to perform this action.');
          break;
        
        case 404:
          // Not found
          toast.error('The requested resource was not found.');
          break;
        
        case 422:
          // Validation error
          if (data.errors) {
            const errorMessages = Object.values(data.errors).flat();
            errorMessages.forEach(message => toast.error(message));
          } else {
            toast.error(data.message || 'Validation failed');
          }
          break;
        
        case 429:
          // Rate limited
          toast.error('Too many requests. Please try again later.');
          break;
        
        case 500:
          // Server error
          toast.error('Server error. Please try again later.');
          break;
        
        default:
          // Other errors
          toast.error(data.message || 'An error occurred');
      }
    } else if (error.request) {
      // Network error
      toast.error('Network error. Please check your connection and try again.');
    } else {
      // Other error
      toast.error('An unexpected error occurred');
    }

    return Promise.reject(error);
  }
);

// API endpoints
export const endpoints = {
  // Auth
  auth: {
    login: '/api/auth/login',
    register: '/api/auth/register',
    logout: '/api/auth/logout',
    refresh: '/api/auth/refresh',
    me: '/api/auth/me',
    changePassword: '/api/auth/change-password',
    forgotPassword: '/api/auth/forgot-password',
    resetPassword: '/api/auth/reset-password',
  },

  // Rooms
  rooms: {
    list: '/api/rooms',
    create: '/api/rooms',
    get: (roomId) => `/api/rooms/${roomId}`,
    update: (roomId) => `/api/rooms/${roomId}`,
    delete: (roomId) => `/api/rooms/${roomId}`,
    join: (roomId) => `/api/rooms/${roomId}/join`,
    leave: (roomId) => `/api/rooms/${roomId}/leave`,
  },

  // Tokens
  tokens: {
    room: '/api/tokens/room',
    recording: '/api/tokens/recording',
    admin: '/api/tokens/admin',
    validate: '/api/tokens/validate',
    health: '/api/tokens/health',
  },

  // Recordings
  recordings: {
    start: '/api/recordings/start',
    stop: '/api/recordings/stop',
    list: (roomId) => `/api/recordings/room/${roomId}`,
    get: (recordingId) => `/api/recordings/${recordingId}`,
    delete: (recordingId) => `/api/recordings/${recordingId}`,
    stats: '/api/recordings/stats/overview',
  },

  // Users
  users: {
    profile: '/api/users/profile',
    list: '/api/users',
    get: (userId) => `/api/users/${userId}`,
    update: (userId) => `/api/users/${userId}`,
    delete: (userId) => `/api/users/${userId}`,
    activate: (userId) => `/api/users/${userId}/activate`,
    deactivate: (userId) => `/api/users/${userId}/deactivate`,
    stats: '/api/users/stats/overview',
  },
};

// API service functions
export const apiService = {
  // Auth functions
  auth: {
    login: (credentials) => api.post(endpoints.auth.login, credentials),
    register: (userData) => api.post(endpoints.auth.register, userData),
    logout: () => api.post(endpoints.auth.logout),
    refresh: () => api.post(endpoints.auth.refresh),
    getProfile: () => api.get(endpoints.auth.me),
    updateProfile: (profileData) => api.put(endpoints.auth.me, profileData),
    changePassword: (passwordData) => api.post(endpoints.auth.changePassword, passwordData),
    forgotPassword: (email) => api.post(endpoints.auth.forgotPassword, { email }),
    resetPassword: (resetData) => api.post(endpoints.auth.resetPassword, resetData),
  },

  // Room functions
  rooms: {
    getList: (params) => api.get(endpoints.rooms.list, { params }),
    create: (roomData) => api.post(endpoints.rooms.create, roomData),
    get: (roomId) => api.get(endpoints.rooms.get(roomId)),
    update: (roomId, roomData) => api.put(endpoints.rooms.update(roomId), roomData),
    delete: (roomId) => api.delete(endpoints.rooms.delete(roomId)),
    join: (roomId, joinData) => api.post(endpoints.rooms.join(roomId), joinData),
    leave: (roomId) => api.post(endpoints.rooms.leave(roomId)),
  },

  // Token functions
  tokens: {
    getRoomToken: (tokenData) => api.post(endpoints.tokens.room, tokenData),
    getRecordingToken: (tokenData) => api.post(endpoints.tokens.recording, tokenData),
    getAdminToken: (tokenData) => api.post(endpoints.tokens.admin, tokenData),
    validate: (token) => api.get(endpoints.tokens.validate, { params: { token } }),
    getHealth: () => api.get(endpoints.tokens.health),
  },

  // Recording functions
  recordings: {
    start: (recordingData) => api.post(endpoints.recordings.start, recordingData),
    stop: (recordingData) => api.post(endpoints.recordings.stop, recordingData),
    getList: (roomId) => api.get(endpoints.recordings.list(roomId)),
    get: (recordingId) => api.get(endpoints.recordings.get(recordingId)),
    delete: (recordingId) => api.delete(endpoints.recordings.delete(recordingId)),
    getStats: () => api.get(endpoints.recordings.stats),
  },

  // User functions
  users: {
    getProfile: () => api.get(endpoints.users.profile),
    updateProfile: (profileData) => api.put(endpoints.users.profile, profileData),
    getList: (params) => api.get(endpoints.users.list, { params }),
    get: (userId) => api.get(endpoints.users.get(userId)),
    update: (userId, userData) => api.put(endpoints.users.update(userId), userData),
    delete: (userId) => api.delete(endpoints.users.delete(userId)),
    activate: (userId) => api.post(endpoints.users.activate(userId)),
    deactivate: (userId) => api.post(endpoints.users.deactivate(userId)),
    getStats: () => api.get(endpoints.users.stats),
  },
};

// Utility functions
export const apiUtils = {
  // Check if response is successful
  isSuccess: (response) => {
    return response && response.status >= 200 && response.status < 300;
  },

  // Extract data from response
  getData: (response) => {
    return response?.data?.data || response?.data;
  },

  // Extract message from response
  getMessage: (response) => {
    return response?.data?.message || 'Success';
  },

  // Extract errors from response
  getErrors: (response) => {
    return response?.data?.errors || {};
  },

  // Create query key for React Query
  createQueryKey: (endpoint, params = {}) => {
    return [endpoint, params];
  },

  // Handle API errors
  handleError: (error, customMessage = null) => {
    const message = customMessage || error.response?.data?.message || 'An error occurred';
    toast.error(message);
    return Promise.reject(error);
  },

  // Retry function for failed requests
  retry: (fn, retries = 3, delay = 1000) => {
    return new Promise((resolve, reject) => {
      fn()
        .then(resolve)
        .catch((error) => {
          if (retries > 0) {
            setTimeout(() => {
              apiUtils.retry(fn, retries - 1, delay * 2)
                .then(resolve)
                .catch(reject);
            }, delay);
          } else {
            reject(error);
          }
        });
    });
  },
};

// Export default api instance
export default api; 