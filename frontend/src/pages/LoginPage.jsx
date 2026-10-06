import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { api, setToken } from "../api/client";
import { useAuth } from "../auth";

export function LoginPage() {
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/api/v1/auth/login", { email, password, mfaCode });
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sso() {
    setError("");
    try {
      await api.post("/api/v1/auth/sso", {});
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.1fr 0.9fr" } }}>
      <Box sx={{ bgcolor: "#0B1F33", color: "#F7FBFF", p: { xs: 4, md: 8 }, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="overline" sx={{ letterSpacing: "0.14em" }}>Enterprise visitor management</Typography>
          <Typography variant="h1" sx={{ fontSize: { xs: "2rem", md: "2.6rem" }, mt: 2, color: "inherit" }}>Access is decided by the visit record.</Typography>
          <Typography sx={{ mt: 2, maxWidth: 460, color: "#D5DDE5" }}>
            Invitation, approval, consent, documents, watchlist, time window, and face verification are inputs. Only an ALLOW decision can request physical access.
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: "grid", placeItems: "center", p: 3 }}>
        <Paper sx={{ p: 3, width: "min(440px, 100%)" }}>
          <Typography variant="h2" gutterBottom>Sign in</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>Use the account stored in the database. Administrators also enter an authenticator code.</Typography>
          <Stack component="form" spacing={2} onSubmit={submit}>
            <TextField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
            <TextField label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            <TextField label="MFA code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} inputProps={{ inputMode: "numeric", autoComplete: "one-time-code" }} helperText="Required for system and security administrators." />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" disabled={busy}>{busy ? "Signing in" : "Sign in"}</Button>
            <Button type="button" variant="outlined" onClick={sso}>Sign in with SSO</Button>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
