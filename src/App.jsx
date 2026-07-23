import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/authStore.jsx';
import { MemberProvider, useMember } from './store/memberStore.jsx';

// Staff imports
import LoginPage from './pages/staff/LoginPage';
import StaffEntryQrPage from './pages/staff/StaffEntryQrPage';
import PublicExperienceBookingPage from './pages/public/PublicExperienceBookingPage';
import CheckinPage from './pages/staff/CheckinPage';
import MembersPage from './pages/staff/MembersPage';
import PassesPage from './pages/staff/PassesPage';
import GymsPage from './pages/staff/GymsPage';
import CardsPage from './pages/staff/CardsPage';
import SalesPage from './pages/staff/SalesPage';
import RevenuePage from './pages/staff/RevenuePage';
import VipPage from './pages/staff/VipPage';
import CoursesPage from './pages/staff/CoursesPage';
import SettingsPage from './pages/staff/SettingsPage';
import DailySettlementPage from './pages/staff/DailySettlementPage';
import InstallmentsPage from './pages/staff/InstallmentsPage';
import FinancePage from './pages/staff/FinancePage';
import SchedulePage from './pages/staff/SchedulePage';
import CompetitionsPage from './pages/staff/CompetitionsPage';
import CourseActivitiesPage from './pages/staff/CourseActivitiesPage';
import RentalsPage from './pages/staff/RentalsPage';
import ShopPage from './pages/staff/ShopPage';
import PendingTasksPage from './pages/staff/PendingTasksPage';
import ExperienceBookingsPage from './pages/staff/ExperienceBookingsPage';
import StaffLayout from './components/StaffLayout';

// Member imports
import MemberLoginPage from './pages/member/MemberLoginPage';
import MemberRegisterPage from './pages/member/MemberRegisterPage';
import MemberVerifyResultPage from './pages/member/MemberVerifyResultPage';
import MemberHomePage from './pages/member/MemberHomePage';
import MemberQRPage from './pages/member/MemberQRPage';
import MemberPassesPage from './pages/member/MemberPassesPage';
import MemberProfilePage from './pages/member/MemberProfilePage';
import MemberGymsPage from './pages/member/MemberGymsPage';
import MemberCoursesPage from './pages/member/MemberCoursesPage';
import MemberFallTestPage from './pages/member/MemberFallTestPage';
import MemberCompetitionsPage from './pages/member/MemberCompetitionsPage';
import MemberRentalPage from './pages/member/MemberRentalPage';
import MemberTeamPage from './pages/member/MemberTeamPage';
import MemberExperiencePage from './pages/member/MemberExperiencePage';
import MemberRecordsPage from './pages/member/MemberRecordsPage';
import MemberForgotPasswordPage from './pages/member/MemberForgotPasswordPage';
import MemberResetPasswordPage from './pages/member/MemberResetPasswordPage';
import ParentCompetitionWaiverPage from './pages/member/ParentCompetitionWaiverPage';
import MemberWaiverPage from './pages/member/MemberWaiverPage';
import ParentWaiverPage from './pages/member/ParentWaiverPage';

const BUILD_TARGET = import.meta.env.VITE_BUILD_TARGET || 'staff';

const StaffRoute = ({ children }) => {
  const { staff, station } = useAuth();
  return (staff || station) ? children : <Navigate to="/login" replace />;
};

const MemberRoute = ({ children }) => {
  const { isLoggedIn, simResolving } = useMember();
  if (simResolving) return null; // ?sim= 自動登入解析中 → 先不導向登入頁
  const loc = useLocation();
  return isLoggedIn ? children : <Navigate to={`/member/login?redirect=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
};

function StaffRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/staff" element={<StaffRoute><StaffLayout /></StaffRoute>}>
        <Route path="checkin"  element={<CheckinPage />} />
        <Route path="members"  element={<MembersPage />} />
        <Route path="passes"   element={<PassesPage />} />
        <Route path="cards"    element={<CardsPage />} />
        <Route path="sales"    element={<SalesPage />} />
        <Route path="revenue"  element={<RevenuePage />} />
        <Route path="gyms"     element={<GymsPage />} />
        <Route path="vip"      element={<VipPage />} />
        <Route path="courses"  element={<CoursesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settlement" element={<DailySettlementPage />} />
        <Route path="installments" element={<InstallmentsPage />} />
        <Route path="finance"      element={<FinancePage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="competitions" element={<CompetitionsPage />} />
        <Route path="rentals"        element={<RentalsPage />} />
        <Route path="shop"           element={<ShopPage />} />
        <Route path="pending-tasks"  element={<PendingTasksPage />} />
        <Route path="experience"     element={<ExperienceBookingsPage />} />
        <Route path="staff-entry"    element={<StaffEntryQrPage />} />
        <Route path="activities"     element={<CourseActivitiesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function MemberRoutes() {
  return (
    <Routes>
      <Route path="/member/login"           element={<MemberLoginPage />} />
      <Route path="/member/forgot-password"  element={<MemberForgotPasswordPage />} />
      <Route path="/member/reset-password"   element={<MemberResetPasswordPage />} />
      <Route path="/member/register" element={<MemberRegisterPage />} />
      <Route path="/book/experience" element={<PublicExperienceBookingPage />} />
      <Route path="/member/verify"   element={<MemberVerifyResultPage />} />
      <Route path="/member/home"    element={<MemberRoute><MemberHomePage /></MemberRoute>} />
      <Route path="/member/qr"      element={<MemberRoute><MemberQRPage /></MemberRoute>} />
      <Route path="/member/passes"  element={<MemberRoute><MemberPassesPage /></MemberRoute>} />
      <Route path="/member/profile" element={<MemberRoute><MemberProfilePage /></MemberRoute>} />
      <Route path="/member/gyms"    element={<MemberRoute><MemberGymsPage /></MemberRoute>} />
      <Route path="/member/courses" element={<MemberRoute><MemberCoursesPage /></MemberRoute>} />
      <Route path="/member/waiver"  element={<MemberRoute><MemberWaiverPage /></MemberRoute>} />
      <Route path="/member/fall-test" element={<MemberRoute><MemberFallTestPage /></MemberRoute>} />
      <Route path="/member/competitions" element={<MemberRoute><MemberCompetitionsPage /></MemberRoute>} />
      <Route path="/member/rental"       element={<MemberRoute><MemberRentalPage /></MemberRoute>} />
      <Route path="/member/team"         element={<MemberRoute><MemberTeamPage /></MemberRoute>} />
      <Route path="/member/experience"   element={<MemberRoute><MemberExperiencePage /></MemberRoute>} />
      <Route path="/member/records"      element={<MemberRoute><MemberRecordsPage /></MemberRoute>} />
      <Route path="/waiver/parent/:token" element={<ParentWaiverPage />} />
      <Route path="/competitions/waiver/parent/:token" element={<ParentCompetitionWaiverPage />} />
      <Route path="*" element={<Navigate to="/member/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MemberProvider>
        <BrowserRouter>
          {BUILD_TARGET === 'member' ? <MemberRoutes /> : <StaffRoutes />}
        </BrowserRouter>
      </MemberProvider>
    </AuthProvider>
  );
}
