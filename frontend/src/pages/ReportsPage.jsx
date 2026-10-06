import { useQuery } from "@tanstack/react-query";
import { Paper, Stack, Typography } from "@mui/material";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

const LABELS = {
  expected: "Expected",
  pending: "Pending approval",
  inside: "Inside",
  deniedToday: "Denied today",
  overstay: "Overstay",
  openAlerts: "Open alerts",
};

export function ReportsPage() {
  const report = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/api/v1/dashboard")).data,
  });

  if (report.isLoading) return <LoadingState label="Loading reports" />;
  if (report.isError) return <ErrorState message="Unable to load reports." />;

  const data = report.data;
  if (data.scope === "own") {
    return (
      <Stack spacing={2}>
        <Typography variant="h1">Reports</Typography>
        {data.visits?.length ? data.visits.map((visit) => (
          <Paper key={visit.id} sx={{ p: 2 }}>
            <Typography>{visit.visitor.name} · {visit.status} · {visit.purpose}</Typography>
          </Paper>
        )) : <EmptyState message="No visits found." />}
      </Stack>
    );
  }

  const counts = data.counts || {};
  const hasActivity = Object.values(counts).some((value) => Number(value) > 0) || (data.byZone || []).some((row) => Number(row.inside) > 0);

  return (
    <Stack spacing={2}>
      <Typography variant="h1">Reports</Typography>
      <Stack direction="row" flexWrap="wrap" gap={2}>
        {Object.entries(LABELS).map(([key, label]) => (
          <Paper key={key} sx={{ p: 2, minWidth: 160 }}>
            <Typography color="text.secondary">{label}</Typography>
            <Typography variant="h1">{Number(counts[key] || 0)}</Typography>
          </Paper>
        ))}
      </Stack>
      <Paper sx={{ p: 2, height: 320 }}>
        <Typography variant="h2" gutterBottom>Occupancy by zone</Typography>
        {!hasActivity && <EmptyState message="No data available for the selected period." />}
        {hasActivity && (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.byZone || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="inside" fill="#0F3D5E" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Paper>
    </Stack>
  );
}
