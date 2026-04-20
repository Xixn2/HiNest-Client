import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import UpdateBanner from "./components/UpdateBanner";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AppLayout from "./components/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import SchedulePage from "./pages/SchedulePage";
import AttendancePage from "./pages/AttendancePage";
import JournalPage from "./pages/JournalPage";
import NoticePage from "./pages/NoticePage";
import ChatPage from "./pages/ChatPage";
import DirectoryPage from "./pages/DirectoryPage";
import DocumentsPage from "./pages/DocumentsPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import OrgChartPage from "./pages/OrgChartPage";
import ProfilePage from "./pages/ProfilePage";
import ExpensePage from "./pages/ExpensePage";
import ProjectPage from "./pages/ProjectPage";
import AdminPage from "./pages/AdminPage";
import SuperAdminPage from "./pages/SuperAdminPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="h-screen grid place-items-center text-slate-400">
        불러오는 중…
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SuperOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.superAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
    <UpdateBanner />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="notice" element={<NoticePage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="directory" element={<DirectoryPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="org" element={<OrgChartPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="expense" element={<ExpensePage />} />
        <Route path="projects/:id" element={<ProjectPage />} />
        <Route
          path="admin"
          element={
            <AdminOnly>
              <AdminPage />
            </AdminOnly>
          }
        />
        <Route
          path="super-admin"
          element={
            <SuperOnly>
              <SuperAdminPage />
            </SuperOnly>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
