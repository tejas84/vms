import { useQuery } from "@tanstack/react-query";
import { Paper, Stack, Typography } from "@mui/material";
import { api } from "../api/client";
import { useAuth } from "../auth";
import { EmptyState, ErrorState, LoadingState, StatusChip } from "../components/States";

export function HomePage() {
  const { user } = useAuth();
  const notes = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/api/v1/notifications")).data.notifications,
  });

  return (
    <Stack spacing={2}>
      <Typography variant="h1">{user.name}</Typography>
      <Typography color="text.secondary">{user.roleLabel}</Typography>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h2" gutterBottom>Operating rule</Typography>
        <Typography>
          Face recognition verifies identity. Entry still depends on visit status, time window, pass, consent, documents, zone, capacity, and watchlist. A failed check stays in the audit trail if an authorized override is used.
        </Typography>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h2" gutterBottom>Notifications</Typography>
        {notes.isLoading && <LoadingState label="Loading notifications" />}
        {notes.isError && <ErrorState message="Unable to load notifications." />}
        {notes.data?.length === 0 && <EmptyState message="No notifications for this account." />}
        <Stack spacing={1}>
          {notes.data?.map((note) => (
            <Stack key={note.id} direction="row" spacing={1} alignItems="center">
              <StatusChip value={note.status} />
              <Typography>{note.message}</Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
