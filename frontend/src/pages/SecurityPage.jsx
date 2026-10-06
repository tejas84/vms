import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { api } from "../api/client";
import { EmptyState, ErrorState, LoadingState, StatusChip } from "../components/States";

export function SecurityPage() {
  const client = useQueryClient();
  const [form, setForm] = useState({ fullName: "", documentRef: "", reason: "" });
  const [dispositionChoice, setDispositionChoice] = useState("cleared");
  const [review, setReview] = useState("");
  const entries = useQuery({ queryKey: ["watchlist"], queryFn: async () => (await api.get("/api/v1/watchlist")).data.entries });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: async () => (await api.get("/api/v1/alerts")).data.alerts });
  const add = useMutation({
    mutationFn: () => api.post("/api/v1/watchlist", form),
    onSuccess: () => {
      setForm({ fullName: "", documentRef: "", reason: "" });
      client.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
  const toggle = useMutation({
    mutationFn: (entry) => api.patch(`/api/v1/watchlist/${entry.id}`, { active: !entry.active }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["watchlist"] }),
  });
  const disposition = useMutation({
    mutationFn: (id) => api.post(`/api/v1/alerts/${id}/review`, { disposition: dispositionChoice, reason: review }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["alerts"] }),
  });

  return (
    <Stack spacing={2}>
      <Typography variant="h1">Watchlist</Typography>
      {(add.isError || disposition.isError) && <Alert severity="error">{(add.error || disposition.error).message}</Alert>}
      <Paper component="form" sx={{ p: 2 }} onSubmit={(event) => { event.preventDefault(); add.mutate(); }}>
        <Typography variant="h2" gutterBottom>Add restricted person</Typography>
        <Stack spacing={1.5}>
          <TextField label="Name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required />
          <TextField label="Document reference" value={form.documentRef} onChange={(event) => setForm({ ...form, documentRef: event.target.value })} />
          <TextField label="Reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required multiline minRows={2} />
          <Button type="submit" variant="contained" disabled={add.isPending}>Save watchlist entry</Button>
        </Stack>
      </Paper>
      <Paper>
        <Typography sx={{ p: 2 }} variant="h2">Entries</Typography>
        {entries.isLoading && <LoadingState />}
        {entries.isError && <ErrorState message="Unable to load the watchlist." />}
        {entries.data?.length === 0 && <EmptyState message="No watchlist entries." />}
        {!!entries.data?.length && (
          <Table size="small">
            <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Document</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {entries.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.full_name}</TableCell>
                  <TableCell>{entry.document_ref || "—"}</TableCell>
                  <TableCell><StatusChip value={entry.active ? "Active" : "Inactive"} /></TableCell>
                  <TableCell><Button size="small" onClick={() => toggle.mutate(entry)}>{entry.active ? "Deactivate" : "Activate"}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h2" gutterBottom>Alerts</Typography>
        <TextField label="Review note" value={review} onChange={(event) => setReview(event.target.value)} helperText="At least 3 characters. Cleared creates a watchlist clearance for the linked visitor." fullWidth sx={{ mb: 1 }} />
        <TextField select label="Disposition" value={dispositionChoice} onChange={(event) => setDispositionChoice(event.target.value)} sx={{ mb: 2, maxWidth: 240 }}>
          <MenuItem value="cleared">cleared</MenuItem>
          <MenuItem value="confirmed">confirmed</MenuItem>
        </TextField>
        {alerts.isLoading && <LoadingState />}
        {alerts.isError && <ErrorState message="Unable to load alerts." />}
        {alerts.data?.length === 0 && <EmptyState message="No security alerts." />}
        <Stack spacing={1}>
          {alerts.data?.map((alert) => (
            <Stack key={alert.id} direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between">
              <Typography>{alert.status} · {alert.created_at}</Typography>
              <Button size="small" variant="outlined" onClick={() => disposition.mutate(alert.id)}>Record review</Button>
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
