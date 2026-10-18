import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import TierRoute from '@/components/TierRoute';
import AdminRoute from '@/components/AdminRoute';
import { I18nProvider } from '@/lib/i18n';
import { ProfileProvider } from '@/lib/ProfileContext';

// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import AuthCallback from '@/pages/AuthCallback';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// App pages
import Landing from '@/pages/Landing';
import Onboarding from '@/pages/Onboarding';
import AppShell from '@/components/zeus/AppShell';
import Home from '@/pages/Home';
import Journey from '@/pages/Journey';
import Roadmap from '@/pages/Roadmap';
import Learn from '@/pages/Learn';
import Progress from '@/pages/Progress';
import Community from '@/pages/Community';
import Projects from '@/pages/Projects';
import Career from '@/pages/Career';
import CVBuilder from '@/pages/CVBuilder';
import Discover from '@/pages/Discover';
import Schedule from '@/pages/Schedule';
import Lesson from '@/pages/Lesson';
import Companion from '@/pages/Companion';
import Notifications from '@/pages/Notifications';
import Profile from '@/pages/Profile';
import Settings from '@/pages/Settings';
import PublicPortfolio from '@/pages/PublicPortfolio';
import Admin from '@/pages/Admin';
import Subscriptions from '@/pages/Subscriptions';
import { GlobalSupport, SocialFooter } from '@/components/zeus/GlobalSupport';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-9 h-9 border-4 border-zeus-gold/30 border-t-zeus-gold rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Never redirect when already on a public route — otherwise the page
      // reloads forever and looks permanently "loading".
      if (window.location.pathname !== '/login') {
        navigateToLogin();
      }
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/portfolio/:userId" element={<PublicPortfolio />} />
      <Route path="/subscriptions" element={<Subscriptions />} />
      <Route path="/pricing" element={<Navigate to="/subscriptions" replace />} />

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/onboarding" element={<ProfileProvider><Onboarding /></ProfileProvider>} />
        {/* Admin console lives in its own shell, fully separate from user pages */}
        <Route path="/admin" element={<AdminRoute />}>
          <Route index element={<Admin tab="stats" />} />
          <Route path="users" element={<Admin tab="users" />} />
          <Route path="subscribers" element={<Admin tab="subscribers" />} />
          <Route path="communities" element={<Admin tab="communities" />} />
          <Route path="moderation" element={<Admin tab="moderation" />} />
          <Route path="broadcast" element={<Admin tab="broadcast" />} />
          <Route path="support" element={<Admin tab="support" />} />
          <Route path="settings" element={<Admin tab="settings" />} />
        </Route>
        <Route element={<ProfileProvider><AppShell /></ProfileProvider>}>
          <Route path="/app" element={<Home />} />
          <Route path="/journey" element={<Navigate to="/roadmap" replace />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/learn" element={<Navigate to="/schedule" replace />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/community" element={<TierRoute minTier="PRIME"><Community /></TierRoute>} />
          <Route path="/projects" element={<TierRoute minTier="PRO"><Projects /></TierRoute>} />
          <Route path="/career" element={<TierRoute minTier="PRIME"><Career /></TierRoute>} />
          <Route path="/cv-builder" element={<TierRoute minTier="PRIME"><CVBuilder /></TierRoute>} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/lesson/:lessonId" element={<Lesson />} />
          <Route path="/companion" element={<Companion />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
            <SocialFooter />
            <GlobalSupport />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App