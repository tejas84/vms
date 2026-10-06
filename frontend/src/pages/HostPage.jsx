import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { api } from "../api/client";
import { QueryState, StatusChip } from "../components/States";

const empty = {
  visitorName: "",
  visitorEmail: "",
  visitorPhone: "",
  organization: "",
  purpose: "",
  zoneId: "",
  scheduledStart: "",
  scheduledEnd: "",
  recurrenceCount: 1,
};

export function HostPage() {
  const client = useQueryClient();
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");
  const visits = useQuery({ queryKey: ["visits"], queryFn: async () => (await api.get("/api/v1/visits")).data.visits });
  const sites = useQuery({ queryKey: ["sites"], queryFn: async () => (await api.get("/api/v1/sites")).data });

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/api/v1/visits", {
        ...form,
        zoneId: form.zoneId || sites.data?.zones?.[0]?.id,
        scheduledStart: new Date(form.scheduledStart).toISOString(),
        scheduledEnd: new Date(form.scheduledEnd).toISOString(),
        recurrenceCount: Number(form.recurrenceCount || 1),
      });
      return data;
    },
    onSuccess: async () => {
      setMessage("Visit submitted.");
      setForm((current) => ({ ...current, visitorName: "", visitorEmail: "", purpose: "" }));
      await client.invalidateQueries({ queryKey: ["visits"] });
    },
  });

  const cancel = useMutation({
    mutationFn: (id) => api.post(`/api/v1/visits/${id}/cancel`, { remarks: "Cancelled by host" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["visits"] }),
  });

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h1">Invitations</Typography>
      {(create.isError || cancel.isError) && <Alert severity="error">{(create.error || cancel.error).message}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
        <Paper sx={{ p: 2, flex: 1, width: "100%" }}>
          <Typography variant="h2" gutterBottom>New visit</Typography>
          <Stack component="form" spacing={1.5} onSubmit={(event) => { event.preventDefault(); setMessage(""); create.mutate(); }}>
            <TextField label="Visitor name" value={form.visitorName} onChange={(event) => setField("visitorName", event.target.value)} required />
            <TextField label="Email" type="email" value={form.visitorEmail} onChange={(event) => setField("visitorEmail", event.target.value)} required />
            <TextField label="Phone" value={form.visitorPhone} onChange={(event) => setField("visitorPhone", event.target.value)} />
            <TextField label="Organization" value={form.organization} onChange={(event) => setField("organization", event.target.value)} />
            <TextField label="Purpose" value={form.purpose} onChange={(event) => setField("purpose", event.target.value)} required />
            <TextField select label="Zone" value={form.zoneId || sites.data?.zones?.[0]?.id || ""} onChange={(event) => setField("zoneId", event.target.value)} required>
              {(sites.data?.zones || []).map((zone) => (
                <MenuItem key={zone.id} value={zone.id}>{zone.name}{zone.approval_required ? " · approval required" : ""}</MenuItem>
              ))}
            </TextField>
            {(sites.data?.zones || []).length === 0 && <Alert severity="info">No access zones are configured. An administrator must add a site and a zone first.</Alert>}
            <TextField label="Start" type="datetime-local" value={form.scheduledStart} onChange={(event) => setField("scheduledStart", event.target.value)} InputLabelProps={{ shrink: true }} required />
            <TextField label="End" type="datetime-local" value={form.scheduledEnd} onChange={(event) => setField("scheduledEnd", event.target.value)} InputLabelProps={{ shrink: true }} required />
            <TextField label="Weekly occurrences" type="number" inputProps={{ min: 1, max: 8 }} value={form.recurrenceCount} onChange={(event) => setField("recurrenceCount", event.target.value)} />
            <Button type="submit" variant="contained" disabled={create.isPending}>Submit visit</Button>
          </Stack>
        </Paper>
        <Paper sx={{ p: 2, flex: 1, width: "100%" }}>
          <Typography variant="h2" gutterBottom>Your visits</Typography>
          <QueryState query={visits} empty={!visits.data?.length} emptyMessage="No visits found.">
            <Stack spacing={1.5}>
              {visits.data?.map((visit) => (
                <Stack key={visit.id} spacing={0.5} sx={{ borderBottom: "1px solid", borderColor: "divider", pb: 1 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography fontWeight={650}>{visit.visitor.name}</Typography>
                    <StatusChip value={visit.status} />
                  </Stack>
                  <Typography color="text.secondary">{visit.purpose} · {visit.zone.name}</Typography>
                  {visit.pass && <Typography sx={{ fontFamily: "ui-monospace, monospace" }}>{visit.pass.code}</Typography>}
                  {!["Inside", "Checked-In", "Checked-Out", "Cancelled"].includes(visit.status) && (
                    <Button size="small" onClick={() => cancel.mutate(visit.id)}>Cancel</Button>
                  )}
                </Stack>
              ))}
            </Stack>
          </QueryState>
          {!visits.isLoading && !visits.data?.length && null}
        </Paper>
      </Stack>
    </Stack>
  );
}
