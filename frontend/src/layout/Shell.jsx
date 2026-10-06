import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { AppBar, Box, Drawer, IconButton, List, ListItemButton, ListItemText, Toolbar, Typography } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { api, clearToken } from "../api/client";
import { can, useAuth } from "../auth";

const NAV = [
  { to: "/home", label: "Home", perm: "dashboard.read" },
  { to: "/host", label: "Invitations", perm: "visits.create" },
  { to: "/approve", label: "Approvals", perm: "approvals.decide" },
  { to: "/visitor", label: "Visitor pass", perm: "invitation.complete" },
  { to: "/reception", label: "Reception", perm: "visits.walkin" },
  { to: "/gate", label: "Gate", perm: "gate.validate" },
  { to: "/security", label: "Watchlist", perm: "watchlist.admin" },
  { to: "/reports", label: "Reports", perm: "reports.read" },
  { to: "/audit", label: "Audit", perm: "audit.read" },
  { to: "/admin", label: "Administration", perm: "admin.config" },
];

export function Shell({ onSignOut }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((item) => can(user, item.perm));

  async function signOut() {
    try {
      await api.post("/api/v1/auth/logout", {});
    } catch {
      /* the token is still removed locally */
    }
    clearToken();
    onSignOut();
  }

  const drawer = (
    <Box sx={{ width: 240 }} role="navigation" aria-label="Portals">
      <Typography sx={{ px: 2, py: 2 }} variant="h3">VMS</Typography>
      <List>
        {items.map((item) => (
          <ListItemButton key={item.to} component={NavLink} to={item.to} onClick={() => setOpen(false)}>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setOpen(true)} sx={{ mr: 1, display: { md: "none" } }} aria-label="Open navigation">
            <MenuIcon />
          </IconButton>
          <Typography sx={{ flexGrow: 1 }} variant="h3" color="inherit">Visitor Management</Typography>
          <Typography sx={{ mr: 2 }} variant="body2">{user.name} · {user.roleLabel}</Typography>
          <IconButton color="inherit" onClick={signOut} aria-label="Sign out" size="small">
            <Typography variant="body2">Sign out</Typography>
          </IconButton>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" sx={{ display: { xs: "none", md: "block" }, width: 240, [`& .MuiDrawer-paper`]: { width: 240, boxSizing: "border-box" } }} open>
        {drawer}
      </Drawer>
      <Drawer variant="temporary" open={open} onClose={() => setOpen(false)} sx={{ display: { md: "none" } }}>
        {drawer}
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, mt: 8, ml: { md: "240px" } }}>
        <Outlet />
      </Box>
    </Box>
  );
}
