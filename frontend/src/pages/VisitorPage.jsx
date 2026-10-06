import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, FormControlLabel, Paper, Stack, TextField, Typography } from "@mui/material";
import QRCode from "qrcode";
import { api } from "../api/client";
import { CapturePair } from "../components/CapturePair";
import { StatusChip } from "../components/States";

export function VisitorPage() {
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState(null);
  const [meta, setMeta] = useState(null);
  const [frames, setFrames] = useState(["", ""]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", organization: "", documentType: "National ID", documentRef: "", consent: false });

  async function lookup(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api.get(`/api/v1/public/invitations/${encodeURIComponent(code.trim())}`);
      setInvite(data.invitation);
      setMeta(data);
      setForm((current) => ({
        ...current,
        fullName: data.invitation.visitor.name,
        phone: data.invitation.visitor.phone || "",
        organization: data.invitation.visitor.organization || "",
      }));
    } catch (err) {
      setInvite(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function complete(event) {
    event.preventDefault();
    setError("");
    if (!form.consent) {
      setError("Consent must be recorded before registration is saved.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/api/v1/public/invitations/${encodeURIComponent(code.trim())}/complete`, {
        ...form,
        imageA: frames[0] || undefined,
        imageB: frames[1] || undefined,
      });
      setInvite(data.visit);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h1">Visitor pass</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper component="form" sx={{ p: 2 }} onSubmit={lookup}>
        <Stack spacing={1.5}>
          <TextField label="Invitation code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="VMS-XXXXXXXX" required />
          <Button type="submit" variant="contained" disabled={busy}>Find invitation</Button>
        </Stack>
      </Paper>
      {invite && (
        <Paper component="form" sx={{ p: 2 }} onSubmit={complete}>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="h2">{invite.purpose}</Typography>
              <StatusChip value={invite.status} />
            </Stack>
            <Typography>{invite.site.name} · {invite.zone.name} · host {invite.host.name}</Typography>
            <PassCard visit={invite} />
            <Typography variant="body2" color="text.secondary">Privacy notice {meta?.consentVersion || "on file"}. The face service stores a template reference. The pass image is not a biometric template.</Typography>
            <TextField label="Full name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required />
            <TextField label="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            <TextField label="Organization" value={form.organization} onChange={(event) => setForm({ ...form, organization: event.target.value })} />
            <TextField label="Document type" value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value })} />
            <TextField label="Document number" value={form.documentRef} onChange={(event) => setForm({ ...form, documentRef: event.target.value })} required={meta?.documentRequired !== false} />
            <FormControlLabel control={<Checkbox checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} />} label="I consent to identity verification and the stated retention policy." />
            <CapturePair onChange={setFrames} />
            <Button type="submit" variant="contained" disabled={busy}>Save registration</Button>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

export function PassCard({ visit }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!visit?.pass?.code) return;
    QRCode.toDataURL(visit.pass.code, { margin: 1, width: 180 }).then(setUrl);
  }, [visit?.pass?.code]);
  if (!visit?.pass) return <Alert severity="info">A pass is issued only after the visit is authorized.</Alert>;
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ border: "1px solid", borderColor: "divider", p: 2 }}>
      {url && <img alt="Visit pass QR code" src={url} width={140} height={140} />}
      <Stack>
        <Typography variant="overline">Visitor pass</Typography>
        <Typography variant="h2">{visit.visitor.name}</Typography>
        <Typography sx={{ fontFamily: "ui-monospace, monospace" }}>{visit.pass.code}</Typography>
        <Typography>{visit.site.name} · {visit.zone.name}</Typography>
        <Typography>Valid until {new Date(visit.pass.expiresAt).toLocaleString()}</Typography>
      </Stack>
    </Stack>
  );
}
