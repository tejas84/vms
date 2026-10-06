import { Navigate, Route, Routes } from "react-router-dom";
import { CircularProgress, Box } from "@mui/material";
import { useAuth } from "./auth";
import { Shell } from "./layout/Shell";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { HostPage } from "./pages/HostPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { VisitorPage } from "./pages/VisitorPage";
import { ReceptionPage } from "./pages/ReceptionPage";
import { GatePage } from "./pages/GatePage";
import { SecurityPage } from "./pages/SecurityPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AuditPage } from "./pages/AuditPage";
import { AdminPage } from "./pages/AdminPage";

export function App() {
  const { user, ready, setUser } = useAuth();
  if (!ready) {
    return <Box sx={{ display: "grid", placeItems: "center", minHeight: "100vh" }}><CircularProgress /></Box>;
  }
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/home" replace /> : <LoginPage />} />
      <Route element={user ? <Shell onSignOut={() => setUser(null)} /> : <Navigate to="/login" replace />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/approve" element={<ApprovalsPage />} />
        <Route path="/visitor" element={<VisitorPage />} />
        <Route path="/reception" element={<ReceptionPage />} />
        <Route path="/gate" element={<GatePage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/dashboard" element={<Navigate to="/reports" replace />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
