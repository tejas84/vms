import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { api } from "../api/client";
import { CapturePair } from "../components/CapturePair";
import { EmptyState, ErrorState, LoadingState, StatusChip } from "../components/States";
import { PassCard } from "./VisitorPage";
import { GatePanel } from "./GatePage";

export function ReceptionPage() {
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [frames, setFrames] = useState(["", ""]);
  const [walkIn, setWalkIn] = useState({ visitorName: "", visitorEmail: "", purpose: "Walk-in", hostId: "", zoneId: "", documentRef: "" });

  const visits = useQuery({
    queryKey: ["visits", search],
    queryFn: async () => (await api.get("/api/v1/visits", { params: search ? { q: search } : {} })).data.visits,
  });
  const sites = useQuery({ queryKey: ["sites"], queryFn: async () => (await api.get("/api/v1/sites")).data });
  const hosts = useQuery({ queryKey: ["hosts"], queryFn: async () => (await api.get("/api/v1/hosts")).data.hosts });
  const detail = useQuery({
    queryKey: ["visit", selectedId],
    enabled: !!selectedId,
    queryFn: async () => (await api.get(`/api/v1/visits/${selectedId}`)).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post("/api/v1/visits/walk-in", {
      ...walkIn,
      hostId: walkIn.hostId || hosts.data?.[0]?.id,
      zoneId: walkIn.zoneId || sites.data?.zones?.[0]?.id,
    })).data,
    onSuccess: (data) => {
      setSelectedId(data.visit.id);
      client.invalidateQueries({ queryKey: ["visits"] });
    },
  });
  const enroll = useMutation({
    mutationFn: () => api.post("/api/v1/face/enroll", { visitId: selectedId, imageA: frames[0], imageB: frames[1], consent: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["visit", selectedId] }),
  });

  const selected = detail.data?.visit;

  return (
    <Stack spacing={2}>
      <Typography variant="h1">Reception</Typography>
      {(create.isError || enroll.isError) && <Alert severity="error">{(create.error || enroll.error).message}</Alert>}
      <Stack direction={{ xs: "column", lg: "row" }} spacing={2} alignItems="flex-start">
        <Stack spacing={2} sx={{ flex: 1, width: "100%" }}>
          <Paper component="form" sx={{ p: 2 }} onSubmit={(event) => { event.preventDefault(); setSearch(q); }}>
            <Stack direction="row" spacing={1}>
              <TextField fullWidth label="Search visitor, email, or pass" value={q} onChange={(event) => setQ(event.target.value)} />
              <Button type="submit" variant="contained">Search</Button>
            </Stack>
          </Paper>
          <Paper>
            {visits.isLoading && <LoadingState />}
            {visits.isError && <ErrorState message="Unable to load visits." />}
            {visits.data?.length === 0 && <EmptyState message="No visits found." />}
            {!!visits.data?.length && (
              <Table size="small">
                <TableHead><TableRow><TableCell>Visitor</TableCell><TableCell>Status</TableCell><TableCell>Zone</TableCell></TableRow></TableHead>
                <TableBody>
                  {visits.data.map((visit) => (
                    <TableRow key={visit.id} hover selected={visit.id === selectedId} onClick={() => setSelectedId(visit.id)} sx={{ cursor: "pointer" }}>
                      <TableCell>{visit.visitor.name}</TableCell>
                      <TableCell><StatusChip value={visit.status} /></TableCell>
                      <TableCell>{visit.zone.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
          <Paper component="form" sx={{ p: 2 }} onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
            <Typography variant="h2" gutterBottom>Walk-in</Typography>
            <Stack spacing={1.5}>
              <TextField label="Name" value={walkIn.visitorName} onChange={(event) => setWalkIn({ ...walkIn, visitorName: event.target.value })} required />
              <TextField label="Email" type="email" value={walkIn.visitorEmail} onChange={(event) => setWalkIn({ ...walkIn, visitorEmail: event.target.value })} required />
              <TextField label="Purpose" value={walkIn.purpose} onChange={(event) => setWalkIn({ ...walkIn, purpose: event.target.value })} />
              <TextField select label="Host" value={walkIn.hostId || hosts.data?.[0]?.id || ""} onChange={(event) => setWalkIn({ ...walkIn, hostId: event.target.value })}>
                {(hosts.data || []).map((host) => <MenuItem key={host.id} value={host.id}>{host.name}</MenuItem>)}
              </TextField>
              {(hosts.data || []).length === 0 && <Alert severity="info">No hosts are available.</Alert>}
              <TextField select label="Zone" value={walkIn.zoneId || sites.data?.zones?.[0]?.id || ""} onChange={(event) => setWalkIn({ ...walkIn, zoneId: event.target.value })}>
                {(sites.data?.zones || []).map((zone) => <MenuItem key={zone.id} value={zone.id}>{zone.name}</MenuItem>)}
              </TextField>
              <TextField label="Document number" value={walkIn.documentRef} onChange={(event) => setWalkIn({ ...walkIn, documentRef: event.target.value })} />
              <Button type="submit" variant="contained" disabled={create.isPending}>Register walk-in</Button>
            </Stack>
          </Paper>
        </Stack>
        <Paper sx={{ p: 2, flex: 1, width: "100%" }}>
          {!selected && <EmptyState message="Select a visit to verify identity and print a pass." />}
          {selected && (
            <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="h2">{selected.visitor.name}</Typography>
                <StatusChip value={selected.status} />
              </Stack>
              <PassCard visit={selected} />
              <Button variant="outlined" onClick={() => window.print()}>Print pass</Button>
              <CapturePair onChange={setFrames} />
              <Button variant="contained" onClick={() => enroll.mutate()} disabled={!frames[0] || !frames[1] || enroll.isPending}>Enroll face</Button>
              {enroll.isSuccess && <Alert severity="success">Enrollment stored.</Alert>}
              <GatePanel visit={selected} gates={sites.data?.gates || []} frames={frames} onDone={() => client.invalidateQueries({ queryKey: ["visit", selectedId] })} />
            </Stack>
          )}
        </Paper>
      </Stack>
    </Stack>
  );
}
