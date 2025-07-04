import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from './contexts/AuthContext';

// Layout components
import Layout from './components/Layout/Layout';
import ProtectedRoute from './components/Auth/ProtectedRoute';

// Page components
import HomePage from './pages/HomePage';
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import DashboardPage from './pages/Dashboard/DashboardPage';
import RoomPage from './pages/Room/RoomPage';
import CreateRoomPage from './pages/Room/CreateRoomPage';
import JoinRoomPage from './pages/Room/JoinRoomPage';
import ProfilePage from './pages/Profile/ProfilePage';
import SettingsPage from './pages/Settings/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';

// Loading and error components
import LoadingSpinner from './components/UI/LoadingSpinner';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Video Call App - High Quality Video Conferencing</title>
        <meta name="description" content="Professional video calling application with LiveKit integration. High-quality video and audio for meetings, webinars, and collaboration." />
        <meta name="keywords" content="video call, video conferencing, livekit, webRTC, online meeting" />
        <meta property="og:title" content="Video Call App" />
        <meta property="og:description" content="High-quality video calling application" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Video Call App" />
        <meta name="twitter:description" content="High-quality video calling application" />
      </Helmet>

      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <RegisterPage />} />

        {/* Protected routes */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/room/create" element={
          <ProtectedRoute>
            <Layout>
              <CreateRoomPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/room/join" element={
          <ProtectedRoute>
            <Layout>
              <JoinRoomPage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/room/:roomId" element={
          <ProtectedRoute>
            <RoomPage />
          </ProtectedRoute>
        } />

        <Route path="/profile" element={
          <ProtectedRoute>
            <Layout>
              <ProfilePage />
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/settings" element={
          <ProtectedRoute>
            <Layout>
              <SettingsPage />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Admin routes */}
        <Route path="/admin/*" element={
          <ProtectedRoute requireAdmin>
            <Layout>
              <AdminRoutes />
            </Layout>
          </ProtectedRoute>
        } />

        {/* 404 route */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

// Admin routes component
function AdminRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/dashboard" element={<AdminDashboardPage />} />
      <Route path="/users" element={<AdminUsersPage />} />
      <Route path="/rooms" element={<AdminRoomsPage />} />
      <Route path="/recordings" element={<AdminRecordingsPage />} />
      <Route path="/analytics" element={<AdminAnalyticsPage />} />
    </Routes>
  );
}

// Lazy load admin pages
const AdminDashboardPage = React.lazy(() => import('./pages/Admin/AdminDashboardPage'));
const AdminUsersPage = React.lazy(() => import('./pages/Admin/AdminUsersPage'));
const AdminRoomsPage = React.lazy(() => import('./pages/Admin/AdminRoomsPage'));
const AdminRecordingsPage = React.lazy(() => import('./pages/Admin/AdminRecordingsPage'));
const AdminAnalyticsPage = React.lazy(() => import('./pages/Admin/AdminAnalyticsPage'));

export default App; 