import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableRow, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { api } from "../api/client";
import { EmptyState, ErrorState, LoadingState, StatusChip } from "../components/States";

const ROLES = ["host", "reception", "security", "approver", "security_admin", "system_admin", "auditor", "visitor"];

export function AdminPage() {
  const client = useQueryClient();
  const policies = useQuery({ queryKey: ["policies"], queryFn: async () => (await api.get("/api/v1/policies")).data.policies });
  const users = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get("/api/v1/users")).data.users });
  const sites = useQuery({ queryKey: ["sites"], queryFn: async () => (await api.get("/api/v1/sites")).data });
  const integrations = useQuery({ queryKey: ["integrations"], queryFn: async () => (await api.get("/api/v1/integrations")).data.integrations });
  const categories = useQuery({ queryKey: ["categories"], queryFn: async () => (await api.get("/api/v1/visitor-categories")).data.categories });
  const [site, setSite] = useState({ name: "", city: "", maxOccupancy: 200 });
  const [zone, setZone] = useState({ name: "", siteId: "", approvalRequired: true, faceRequired: true });
  const [gate, setGate] = useState({ name: "", siteId: "", kind: "pedestrian" });
  const [person, setPerson] = useState({ name: "", email: "", role: "host", password: "" });
  const [category, setCategory] = useState("");
  const [mfa, setMfa] = useState("");
  const [message, setMessage] = useState("");

  const savePolicy = useMutation({
    mutationFn: ({ key, value }) => api.put(`/api/v1/policies/${key}`, { value }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["policies"] }),
  });
  const addSite = useMutation({
    mutationFn: () => api.post("/api/v1/sites", { ...site, maxOccupancy: Number(site.maxOccupancy) }),
    onSuccess: () => { setMessage("Site created."); client.invalidateQueries({ queryKey: ["sites"] }); },
  });
  const addZone = useMutation({
    mutationFn: () => api.post("/api/v1/zones", { ...zone, siteId: zone.siteId || sites.data?.sites?.[0]?.id }),
    onSuccess: () => { setMessage("Zone created."); client.invalidateQueries({ queryKey: ["sites"] }); },
  });
  const addGate = useMutation({
    mutationFn: () => api.post("/api/v1/gates", { ...gate, siteId: gate.siteId || sites.data?.sites?.[0]?.id }),
    onSuccess: () => { setMessage("Gate created."); client.invalidateQueries({ queryKey: ["sites"] }); },
  });
  const addUser = useMutation({
    mutationFn: async () => (await api.post("/api/v1/users", person)).data,
    onSuccess: (data) => {
      setMfa(data.mfaSetup?.secret || "");
      setMessage("User created.");
      setPerson({ name: "", email: "", role: person.role, password: "" });
      client.invalidateQueries({ queryKey: ["users"] });
    },
  });
  const addCategory = useMutation({
    mutationFn: () => api.post("/api/v1/visitor-categories", { name: category }),
    onSuccess: () => { setCategory(""); client.invalidateQueries({ queryKey: ["categories"] }); },
  });
  const retention = useMutation({
    mutationFn: async () => (await api.post("/api/v1/retention/run", {})).data,
    onSuccess: (data) => setMessage(`Retention deleted ${data.deleted} enrollment records older than ${data.policyDays} days.`),
  });

  const error = [savePolicy, addSite, addZone, addGate, addUser, addCategory, retention].find((item) => item.isError)?.error;

  return (
    <Stack spacing={2}>
      <Typography variant="h1">Administration</Typography>
      {error && <Alert severity="error">{error.message}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      {mfa && <Alert severity="warning">Authenticator secret, shown once: {mfa}</Alert>}
      <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="h2" gutterBottom>Policies</Typography>
          {policies.isLoading && <LoadingState />}
          {policies.isError && <ErrorState message="Unable to load policies." />}
          <Stack spacing={1}>
            {policies.data?.map((item) => (
              <PolicyRow key={item.key} item={item} onSave={(value) => savePolicy.mutate({ key: item.key, value })} />
            ))}
          </Stack>
          <Button sx={{ mt: 2 }} variant="outlined" onClick={() => retention.mutate()}>Run retention deletion</Button>
        </Paper>
        <Paper sx={{ p: 2, flex: 1 }}>
          <Typography variant="h2" gutterBottom>Site</Typography>
          <Stack component="form" spacing={1} onSubmit={(event) => { event.preventDefault(); addSite.mutate(); }}>
            <TextField label="Name" value={site.name} onChange={(event) => setSite({ ...site, name: event.target.value })} required />
            <TextField label="City" value={site.city} onChange={(event) => setSite({ ...site, city: event.target.value })} />
            <TextField label="Occupancy limit" type="number" value={site.maxOccupancy} onChange={(event) => setSite({ ...site, maxOccupancy: event.target.value })} />
            <Button type="submit" variant="contained">Add site</Button>
          </Stack>
          <Typography variant="h3" sx={{ mt: 2 }}>Zone</Typography>
          <Stack component="form" spacing={1} onSubmit={(event) => { event.preventDefault(); addZone.mutate(); }}>
            <TextField label="Name" value={zone.name} onChange={(event) => setZone({ ...zone, name: event.target.value })} required />
            <TextField select label="Site" value={zone.siteId || sites.data?.sites?.[0]?.id || ""} onChange={(event) => setZone({ ...zone, siteId: event.target.value })}>
              {(sites.data?.sites || []).map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
            </TextField>
            <FormControlLabel control={<Checkbox checked={zone.approvalRequired} onChange={(event) => setZone({ ...zone, approvalRequired: event.target.checked })} />} label="Approval required" />
            <FormControlLabel control={<Checkbox checked={zone.faceRequired} onChange={(event) => setZone({ ...zone, faceRequired: event.target.checked })} />} label="Face verification required" />
            <Button type="submit" variant="contained">Add zone</Button>
          </Stack>
          <Typography variant="h3" sx={{ mt: 2 }}>Gate</Typography>
          <Stack component="form" spacing={1} onSubmit={(event) => { event.preventDefault(); addGate.mutate(); }}>
            <TextField label="Name" value={gate.name} onChange={(event) => setGate({ ...gate, name: event.target.value })} required />
            <TextField select label="Site" value={gate.siteId || sites.data?.sites?.[0]?.id || ""} onChange={(event) => setGate({ ...gate, siteId: event.target.value })}>
              {(sites.data?.sites || []).map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
            </TextField>
            <Button type="submit" variant="contained">Add gate</Button>
          </Stack>
        </Paper>
      </Stack>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h2" gutterBottom>User</Typography>
        <Stack component="form" spacing={1.5} onSubmit={(event) => { event.preventDefault(); setMfa(""); addUser.mutate(); }}>
          <TextField label="Name" value={person.name} onChange={(event) => setPerson({ ...person, name: event.target.value })} required />
          <TextField label="Email" type="email" value={person.email} onChange={(event) => setPerson({ ...person, email: event.target.value })} required />
          <TextField select label="Role" value={person.role} onChange={(event) => setPerson({ ...person, role: event.target.value })}>
            {ROLES.map((role) => <MenuItem key={role} value={role}>{role}</MenuItem>)}
          </TextField>
          <TextField label="Password" type="password" value={person.password} onChange={(event) => setPerson({ ...person, password: event.target.value })} autoComplete="new-password" required inputProps={{ minLength: 10 }} />
          <Button type="submit" variant="contained">Create user</Button>
        </Stack>
        {users.isLoading && <LoadingState />}
        {users.data?.length === 0 && <EmptyState message="No users found." />}
        {!!users.data?.length && (
          <Table size="small">
            <TableBody>
              {users.data.map((user) => (
                <TableRow key={user.id}><TableCell>{user.name}</TableCell><TableCell>{user.email}</TableCell><TableCell>{user.roleLabel || user.role}</TableCell><TableCell>{user.disabled ? "Disabled" : "Active"}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h2">Visitor categories</Typography>
        {categories.data?.length === 0 && <EmptyState message="No visitor categories have been configured." />}
        <Stack component="form" direction="row" spacing={1} onSubmit={(event) => { event.preventDefault(); addCategory.mutate(); }}>
          <TextField label="Category name" value={category} onChange={(event) => setCategory(event.target.value)} required />
          <Button type="submit" variant="outlined">Add</Button>
        </Stack>
        {categories.data?.map((item) => <Typography key={item.id}>{item.name}</Typography>)}
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h2" gutterBottom>Integrations</Typography>
        {integrations.isLoading && <LoadingState />}
        {integrations.data?.map((item) => (
          <Stack key={item.id} direction="row" spacing={1} sx={{ py: 0.5 }}>
            <Typography sx={{ minWidth: 160 }}>{item.name}</Typography>
            <StatusChip value={item.status} />
            <Typography color="text.secondary">{item.detail}</Typography>
          </Stack>
        ))}
      </Paper>
    </Stack>
  );
}

function PolicyRow({ item, onSave }) {
  const [value, setValue] = useState(item.value);
  const boolean = typeof item.value === "boolean";
  const number = typeof item.value === "number";
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
      <Typography sx={{ minWidth: 200 }}>{item.key}</Typography>
      {boolean ? (
        <TextField select size="small" value={String(value)} onChange={(event) => setValue(event.target.value === "true")}>
          <MenuItem value="true">true</MenuItem>
          <MenuItem value="false">false</MenuItem>
        </TextField>
      ) : (
        <TextField size="small" value={value} onChange={(event) => setValue(number ? Number(event.target.value) : event.target.value)} />
      )}
      <Button onClick={() => onSave(value)}>Save</Button>
    </Stack>
  );
}
