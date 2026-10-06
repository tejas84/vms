import { useState } from "react";
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { can, useAuth } from "../auth";
import { CapturePair } from "../components/CapturePair";
import { StatusChip } from "../components/States";

export function GatePage() {
  const sites = useQuery({ queryKey: ["sites"], queryFn: async () => (await api.get("/api/v1/sites")).data });
  const [code, setCode] = useState("");
  const [frames, setFrames] = useState(["", ""]);
  const [visit, setVisit] = useState(null);

  return (
    <Stack spacing={2}>
      <Typography variant="h1">Gate</Typography>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <TextField label="Pass code" value={code} onChange={(event) => setCode(event.target.value)} />
          <CapturePair onChange={setFrames} />
          <GatePanel
            visit={visit || { id: null, pass: code ? { code } : null }}
            gates={sites.data?.gates || []}
            frames={frames}
            onDone={setVisit}
          />
        </Stack>
      </Paper>
    </Stack>
  );
}

export function GatePanel({ visit, gates, frames, onDone }) {
  const { user } = useAuth();
  const [gateId, setGateId] = useState("");
  const [result, setResult] = useState(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedGate = gateId || gates[0]?.id || "";

  async function validate() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { data } = await api.post("/api/v1/gate/validate", {
        code: visit.pass?.code,
        visitId: visit.id,
        gateId: selectedGate,
        imageA: frames[0],
        imageB: frames[1],
      });
      setResult(data);
      onDone?.(data.visit);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkIn() {
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/api/v1/gate/check-in", { decisionId: result.decisionId, idempotencyKey: crypto.randomUUID() });
      setNotice(data.physicalAccess?.message || "Entry recorded.");
      setResult(null);
      onDone?.(data.visit);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkOut() {
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/api/v1/gate/check-out", {
        visitId: visit.id,
        code: visit.pass?.code,
        gateId: selectedGate,
        idempotencyKey: crypto.randomUUID(),
      });
      setNotice(data.physicalAccess?.message || "Exit recorded.");
      onDone?.(data.visit);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function override() {
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/api/v1/gate/override", { decisionId: result.decisionId, gateId: selectedGate, reason });
      setResult({ ...result, decisionId: data.decisionId, decision: "ALLOW", reasons: [{ code: "MANUAL_OVERRIDE", message: data.note }] });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={1.5}>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="warning">{notice}</Alert>}
      <TextField select label="Checkpoint" value={selectedGate} onChange={(event) => setGateId(event.target.value)}>
        {gates.length === 0 && <MenuItem value="">No gates configured</MenuItem>}
        {gates.map((gate) => <MenuItem key={gate.id} value={gate.id}>{gate.name}</MenuItem>)}
      </TextField>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={validate} disabled={busy || !visit.pass?.code}>Validate access</Button>
        <Button variant="outlined" onClick={checkOut} disabled={busy || !visit.pass?.code}>Check out</Button>
      </Stack>
      {result && (
        <Paper sx={{ p: 2, borderColor: result.decision === "ALLOW" ? "success.main" : result.decision === "DENY" ? "error.main" : "warning.main" }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h2">{result.decision}</Typography>
            <StatusChip value={result.decision} />
          </Stack>
          {(result.reasons || []).map((item) => <Typography key={item.code}>{item.message}</Typography>)}
          {result.decision === "ALLOW" && <Button sx={{ mt: 1 }} variant="contained" onClick={checkIn}>Record entry</Button>}
          {result.decision !== "ALLOW" && can(user, "gate.override") && (
            <Stack spacing={1} sx={{ mt: 1 }}>
              <TextField label="Override reason" value={reason} onChange={(event) => setReason(event.target.value)} helperText="At least 8 characters. The failed decision stays in the audit log." />
              <Button color="warning" variant="outlined" onClick={override}>Override and allow</Button>
            </Stack>
          )}
        </Paper>
      )}
    </Stack>
  );
}
