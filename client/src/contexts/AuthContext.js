import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

// Initial state
const initialState = {
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  loading: true,
};

// Action types
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_USER: 'SET_USER',
  SET_TOKEN: 'SET_TOKEN',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGOUT: 'LOGOUT',
  UPDATE_USER: 'UPDATE_USER',
  CLEAR_AUTH: 'CLEAR_AUTH',
};

// Reducer
function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload,
      };
    case AUTH_ACTIONS.SET_USER:
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
        loading: false,
      };
    case AUTH_ACTIONS.SET_TOKEN:
      return {
        ...state,
        token: action.payload,
      };
    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        loading: false,
      };
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
      };
    case AUTH_ACTIONS.UPDATE_USER:
      return {
        ...state,
        user: { ...state.user, ...action.payload },
      };
    case AUTH_ACTIONS.CLEAR_AUTH:
      return {
        ...initialState,
        loading: false,
      };
    default:
      return state;
  }
}

// Create context
const AuthContext = createContext();

// Provider component
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Set up axios interceptor for authentication
  useEffect(() => {
    if (state.token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${state.token}`;
    } else {
      delete api.defaults.headers.common['Authorization'];
    }
  }, [state.token]);

  // Fetch user profile on mount if token exists
  const { data: userData, error: userError } = useQuery(
    ['user', 'profile'],
    () => api.get('/api/auth/me').then(res => res.data.data.user),
    {
      enabled: !!state.token,
      retry: false,
      onSuccess: (data) => {
        dispatch({ type: AUTH_ACTIONS.SET_USER, payload: data });
      },
      onError: () => {
        // Token is invalid, clear auth
        dispatch({ type: AUTH_ACTIONS.CLEAR_AUTH });
        localStorage.removeItem('token');
      },
    }
  );

  // Login mutation
  const loginMutation = useMutation(
    (credentials) => api.post('/api/auth/login', credentials),
    {
      onSuccess: (response) => {
        const { user, token } = response.data.data;
        localStorage.setItem('token', token);
        dispatch({ type: AUTH_ACTIONS.LOGIN_SUCCESS, payload: { user, token } });
        toast.success('Login successful!');
        navigate('/dashboard');
      },
      onError: (error) => {
        const message = error.response?.data?.message || 'Login failed';
        toast.error(message);
      },
    }
  );

  // Register mutation
  const registerMutation = useMutation(
    (userData) => api.post('/api/auth/register', userData),
    {
      onSuccess: (response) => {
        const { user, token } = response.data.data;
        localStorage.setItem('token', token);
        dispatch({ type: AUTH_ACTIONS.LOGIN_SUCCESS, payload: { user, token } });
        toast.success('Registration successful!');
        navigate('/dashboard');
      },
      onError: (error) => {
        const message = error.response?.data?.message || 'Registration failed';
        toast.error(message);
      },
    }
  );

  // Logout mutation
  const logoutMutation = useMutation(
    () => api.post('/api/auth/logout'),
    {
      onSuccess: () => {
        handleLogout();
        toast.success('Logged out successfully');
      },
      onError: () => {
        // Even if logout API fails, clear local state
        handleLogout();
      },
    }
  );

  // Refresh token mutation
  const refreshTokenMutation = useMutation(
    () => api.post('/api/auth/refresh'),
    {
      onSuccess: (response) => {
        const { user, token } = response.data.data;
        localStorage.setItem('token', token);
        dispatch({ type: AUTH_ACTIONS.LOGIN_SUCCESS, payload: { user, token } });
      },
      onError: () => {
        // Refresh failed, logout user
        handleLogout();
      },
    }
  );

  // Update profile mutation
  const updateProfileMutation = useMutation(
    (profileData) => api.put('/api/auth/me', profileData),
    {
      onSuccess: (response) => {
        const user = response.data.data.user;
        dispatch({ type: AUTH_ACTIONS.UPDATE_USER, payload: user });
        toast.success('Profile updated successfully');
      },
      onError: (error) => {
        const message = error.response?.data?.message || 'Failed to update profile';
        toast.error(message);
      },
    }
  );

  // Change password mutation
  const changePasswordMutation = useMutation(
    (passwordData) => api.post('/api/auth/change-password', passwordData),
    {
      onSuccess: () => {
        toast.success('Password changed successfully');
      },
      onError: (error) => {
        const message = error.response?.data?.message || 'Failed to change password';
        toast.error(message);
      },
    }
  );

  // Forgot password mutation
  const forgotPasswordMutation = useMutation(
    (email) => api.post('/api/auth/forgot-password', { email }),
    {
      onSuccess: () => {
        toast.success('Password reset email sent');
      },
      onError: (error) => {
        const message = error.response?.data?.message || 'Failed to send reset email';
        toast.error(message);
      },
    }
  );

  // Reset password mutation
  const resetPasswordMutation = useMutation(
    (resetData) => api.post('/api/auth/reset-password', resetData),
    {
      onSuccess: () => {
        toast.success('Password reset successfully');
        navigate('/login');
      },
      onError: (error) => {
        const message = error.response?.data?.message || 'Failed to reset password';
        toast.error(message);
      },
    }
  );

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('token');
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
    queryClient.clear();
    navigate('/');
  };

  // Login function
  const login = (credentials) => {
    loginMutation.mutate(credentials);
  };

  // Register function
  const register = (userData) => {
    registerMutation.mutate(userData);
  };

  // Logout function
  const logout = () => {
    logoutMutation.mutate();
  };

  // Refresh token function
  const refreshToken = () => {
    refreshTokenMutation.mutate();
  };

  // Update profile function
  const updateProfile = (profileData) => {
    updateProfileMutation.mutate(profileData);
  };

  // Change password function
  const changePassword = (passwordData) => {
    changePasswordMutation.mutate(passwordData);
  };

  // Forgot password function
  const forgotPassword = (email) => {
    forgotPasswordMutation.mutate(email);
  };

  // Reset password function
  const resetPassword = (resetData) => {
    resetPasswordMutation.mutate(resetData);
  };

  // Check if user is admin
  const isAdmin = () => {
    return state.user?.role === 'admin';
  };

  // Check if user is moderator
  const isModerator = () => {
    return state.user?.role === 'moderator' || state.user?.role === 'admin';
  };

  // Value object
  const value = {
    // State
    user: state.user,
    token: state.token,
    isAuthenticated: state.isAuthenticated,
    loading: state.loading,
    
    // Mutations
    loginMutation,
    registerMutation,
    logoutMutation,
    refreshTokenMutation,
    updateProfileMutation,
    changePasswordMutation,
    forgotPasswordMutation,
    resetPasswordMutation,
    
    // Functions
    login,
    register,
    logout,
    refreshToken,
    updateProfile,
    changePassword,
    forgotPassword,
    resetPassword,
    
    // Utility functions
    isAdmin,
    isModerator,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Custom hook for admin access
export function useAdmin() {
  const { user, isAdmin } = useAuth();
  return {
    isAdmin: isAdmin(),
    user,
  };
}

// Custom hook for moderator access
export function useModerator() {
  const { user, isModerator } = useAuth();
  return {
    isModerator: isModerator(),
    user,
  };
} 