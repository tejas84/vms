import { Alert, Box, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { decisionColor } from "../theme";

export function LoadingState({ label = "Loading" }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 4 }} alignItems="center">
      <CircularProgress size={22} />
      <Typography color="text.secondary">{label}</Typography>
    </Stack>
  );
}

export function ErrorState({ message = "Unable to load this information." }) {
  return <Alert severity="error">{message}</Alert>;
}

export function EmptyState({ message = "No data available." }) {
  return (
    <Box sx={{ py: 3 }}>
      <Typography color="text.secondary">{message}</Typography>
    </Box>
  );
}

export function StatusChip({ value }) {
  return <Chip size="small" label={value || "Unknown"} color={decisionColor(value)} variant={decisionColor(value) === "default" ? "outlined" : "filled"} />;
}

export function QueryState({ query, empty, emptyMessage, children }) {
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error.message} />;
  if (empty) return <EmptyState message={emptyMessage} />;
  return children;
}
