import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { api } from "../api/client";
import { EmptyState, ErrorState, LoadingState, StatusChip } from "../components/States";

export function ApprovalsPage() {
  const client = useQueryClient();
  const [remarks, setRemarks] = useState("");
  const queue = useQuery({
    queryKey: ["approvals"],
    queryFn: async () => {
      const pending = await api.get("/api/v1/visits", { params: { status: "Pending Approval" } });
      const held = await api.get("/api/v1/visits", { params: { status: "On Hold" } });
      return [...pending.data.visits, ...held.data.visits];
    },
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }) => api.post(`/api/v1/approvals/${id}`, { decision, remarks }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["approvals"] }),
  });

  return (
    <Stack spacing={2}>
      <Typography variant="h1">Approval queue</Typography>
      <TextField label="Remark" value={remarks} onChange={(event) => setRemarks(event.target.value)} helperText="Required when rejecting or escalating." multiline minRows={2} />
      {decide.isError && <Alert severity="error">{decide.error.message}</Alert>}
      {queue.isLoading && <LoadingState />}
      {queue.isError && <ErrorState message="Unable to load the approval queue." />}
      {queue.data?.length === 0 && <EmptyState message="No visits are waiting for approval." />}
      {queue.data?.map((visit) => (
        <Paper key={visit.id} sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography fontWeight={650}>{visit.visitor.name}</Typography>
            <StatusChip value={visit.status} />
          </Stack>
          <Typography color="text.secondary">{visit.purpose} · {visit.zone.name} · host {visit.host.name}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button variant="contained" onClick={() => decide.mutate({ id: visit.id, decision: "approve" })}>Approve</Button>
            <Button color="error" variant="outlined" onClick={() => decide.mutate({ id: visit.id, decision: "reject" })}>Reject</Button>
            <Button variant="outlined" onClick={() => decide.mutate({ id: visit.id, decision: "escalate" })}>Escalate</Button>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
