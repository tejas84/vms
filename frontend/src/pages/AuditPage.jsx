import { useQuery } from "@tanstack/react-query";
import { Button, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { api } from "../api/client";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

export function AuditPage() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const events = useQuery({
    queryKey: ["audit", term],
    queryFn: async () => (await api.get("/api/v1/audit", { params: term ? { q: term } : {} })).data.events,
  });

  return (
    <Stack spacing={2}>
      <Typography variant="h1">Audit</Typography>
      <Stack component="form" direction="row" spacing={1} onSubmit={(event) => { event.preventDefault(); setTerm(q); }}>
        <TextField label="Search event or record" value={q} onChange={(event) => setQ(event.target.value)} fullWidth />
        <Button type="submit" variant="contained">Search</Button>
      </Stack>
      <Paper>
        {events.isLoading && <LoadingState />}
        {events.isError && <ErrorState message="Unable to load the audit trail." />}
        {events.data?.length === 0 && <EmptyState message="No audit events found." />}
        {!!events.data?.length && (
          <Table size="small">
            <TableHead><TableRow><TableCell>When</TableCell><TableCell>Event</TableCell><TableCell>Entity</TableCell><TableCell>Detail</TableCell></TableRow></TableHead>
            <TableBody>
              {events.data.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{new Date(event.created_at).toLocaleString()}</TableCell>
                  <TableCell>{event.event_type}</TableCell>
                  <TableCell>{event.entity_id}</TableCell>
                  <TableCell>{event.new_value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
