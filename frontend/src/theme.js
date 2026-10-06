import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#0F3D5E", contrastText: "#F7FBFF" },
    secondary: { main: "#3D4F61" },
    success: { main: "#1B7F4E" },
    warning: { main: "#B86E00" },
    error: { main: "#B42318" },
    info: { main: "#175CD3" },
    background: { default: "#F4F6F8", paper: "#FFFFFF" },
    text: { primary: "#122033", secondary: "#526070" },
    divider: "#D5DDE5",
  },
  shape: { borderRadius: 4 },
  typography: {
    fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
    h1: { fontSize: "1.75rem", fontWeight: 650, letterSpacing: "-0.02em" },
    h2: { fontSize: "1.25rem", fontWeight: 650 },
    h3: { fontSize: "1.05rem", fontWeight: 650 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: "1px solid #D5DDE5" } } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 650, background: "#F7F9FB" } } },
    MuiAppBar: { styleOverrides: { root: { background: "#0B1F33" } } },
  },
});

export function decisionColor(value) {
  const key = String(value || "").toUpperCase();
  if (["ALLOW", "APPROVED", "EXPECTED", "CHECKED-IN", "INSIDE", "ACTIVE"].includes(key)) return "success";
  if (["DENY", "CANCELLED", "REJECTED", "ERROR"].includes(key)) return "error";
  if (["HOLD", "ON HOLD", "PENDING APPROVAL", "EXPIRED", "WARNING"].includes(key)) return "warning";
  if (["ADDITIONAL_APPROVAL", "ADDITIONAL APPROVAL"].includes(key)) return "info";
  return "default";
}
