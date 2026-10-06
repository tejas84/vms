import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, setToken } from "./api";
import { can, useAuth } from "./auth";

function Page({ title, kicker, children, actions }) {
  return (
    <main className="main">
      <header className="topbar">
        <div>
          <p className="eyebrow">{kicker}</p>
          <h1>{title}</h1>
        </div>
        <div className="no-print">{actions}</div>
      </header>
      {children}
    </main>
  );
}

function Pill({ value }) {
  const tone =
    {
      Expected: "ok",
      Inside: "ok",
      "Checked-In": "ok",
      Approved: "ok",
      ALLOW: "ok",
      "Pending Approval": "warn",
      "On Hold": "warn",
      "Waiting at Reception": "warn",
      HOLD: "warn",
      ADDITIONAL_APPROVAL: "warn",
      DENY: "danger",
      Cancelled: "danger",
      Expired: "danger",
    }[value] || "neutral";
  return <span className={`pill ${tone}`}>{value}</span>;
}

function ErrorNote({ error }) {
  if (!error) return null;
  return <p className="error">{error}</p>;
}

async function fileToDataUrl(file) {
  const data = await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:${file.type || "image/jpeg"};base64,${btoa(binary)}`;
}

function CapturePair({ onChange }) {
  const videoRef = useRef(null);
  const [frames, setFrames] = useState(["", ""]);
  const [cameraError, setCameraError] = useState("");

  function publish(next) {
    setFrames(next);
    onChange(next);
  }

  async function start() {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    } catch {
      setCameraError("Camera is unavailable. Upload two slightly different frames instead.");
    }
  }

  function snap(index) {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 360;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0, 480, 360);
    const next = [...frames];
    next[index] = canvas.toDataURL("image/jpeg", 0.9);
    publish(next);
  }

  async function onFile(event, index) {
    const file = event.target.files?.[0];
    if (!file) return;
    const next = [...frames];
    next[index] = await fileToDataUrl(file);
    publish(next);
  }

  return (
    <div className="stack">
      <video className="video" ref={videoRef} muted playsInline />
      <div className="row-actions">
        <button className="btn secondary" type="button" onClick={start}>Start camera</button>
        <button className="btn secondary" type="button" onClick={() => snap(0)}>Capture frame A</button>
        <button className="btn secondary" type="button" onClick={() => snap(1)}>Capture frame B</button>
      </div>
      <div className="captures">
        {frames.map((frame, index) =>
          frame ? <img key={index} alt={`Capture ${index + 1}`} src={frame} /> : <div key={index} className="preview" />,
        )}
      </div>
      <div className="grid two">
        <label>Frame A file<input type="file" accept="image/*" onChange={(event) => onFile(event, 0)} /></label>
        <label>Frame B file<input type="file" accept="image/*" onChange={(event) => onFile(event, 1)} /></label>
      </div>
      <p className="note">Two frames are required while liveness is enabled. Use a small natural change between them. Identical files are rejected.</p>
      {cameraError && <p className="note">{cameraError}</p>}
    </div>
  );
}

function PassCard({ visit }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!visit?.pass?.code) return;
    QRCode.toDataURL(visit.pass.code, { margin: 1, width: 180 }).then(setUrl);
  }, [visit?.pass?.code]);
  if (!visit?.pass) return <p className="note">A pass is issued only after the visit is authorized.</p>;
  return (
    <article className="pass">
      {url ? <img alt="Visit pass QR code" src={url} /> : <div />}
      <div>
        <p className="eyebrow">Visitor pass</p>
        <h2>{visit.visitor.name}</h2>
        <p className="mono">{visit.pass.code}</p>
        <p>{visit.site.name} · {visit.zone.name}</p>
        <p>Host {visit.host.name}</p>
        <p>Valid until {new Date(visit.pass.expiresAt).toLocaleString()}</p>
      </div>
    </article>
  );
}

function VisitTable({ visits, onSelect }) {
  return (
    <div className="card">
      <table>
        <thead>
          <tr><th>Visitor</th><th>Purpose</th><th>When</th><th>Zone</th><th>Status</th></tr>
        </thead>
        <tbody>
          {visits.map((visit) => (
            <tr key={visit.id} className={onSelect ? "clickable" : ""} onClick={() => onSelect?.(visit)}>
              <td>{visit.visitor.name}<div className="note">{visit.host.name}</div></td>
              <td>{visit.purpose}</td>
              <td>{new Date(visit.scheduledStart).toLocaleString()}</td>
              <td>{visit.zone.name}</td>
              <td><Pill value={visit.status} />{visit.overstay ? " Overstay" : ""}</td>
            </tr>
          ))}
          {visits.length === 0 && <tr><td colSpan="5">No visits in this view.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function LoginPage() {
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/v1/auth/login", { method: "POST", body: { email, password, mfaCode } });
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sso() {
    setError("");
    try {
      await api("/api/v1/auth/sso", { method: "POST", body: {} });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-screen">
      <section className="login-hero">
        <div>
          <p className="eyebrow">Visitor Management System</p>
          <h1>Entry follows the visit, not the face match.</h1>
          <p>Invitation, approval, consent, documents, watchlist, time window, and face verification all feed one access decision.</p>
        </div>
        <p>Sign in with the account stored in your MySQL database. Administrators also enter the code from their authenticator app.</p>
      </section>
      <section className="login-panel">
        <form className="login-card stack" onSubmit={submit}>
          <h2>Sign in</h2>
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          <label>MFA code<input value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" /></label>
          <p className="note">Leave MFA blank unless your role is system administrator or security administrator.</p>
          <ErrorNote error={error} />
          <button className="btn" type="submit" disabled={busy}>Sign in</button>
          <button className="btn secondary" type="button" onClick={sso}>Sign in with SSO</button>
        </form>
      </section>
    </div>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/api/v1/notifications").then((data) => setNotes(data.notifications)).catch((err) => setError(err.message));
  }, []);
  return (
    <Page title={`Hello, ${user.name}`} kicker={user.roleLabel}>
      <div className="grid two">
        <section className="card stack">
          <h2>How this desk works</h2>
          <p>Face recognition verifies identity. The gate still checks visit status, time window, pass, consent, documents, zone, capacity, and watchlist before anyone is allowed in.</p>
          <p>Camera, network, or recognition failures stay on a controlled manual path. An override keeps the failed check in the audit trail.</p>
        </section>
        <section className="card">
          <h2>Notifications</h2>
          <ErrorNote error={error} />
          <div className="list">
            {notes.slice(0, 6).map((note) => (
              <article key={note.id}>
                <strong>{note.template}</strong> · <Pill value={note.status} />
                <div>{note.message}</div>
              </article>
            ))}
            {notes.length === 0 && <p className="note">No messages for this account yet.</p>}
          </div>
        </section>
      </div>
    </Page>
  );
}

export function HostPage() {
  const [visits, setVisits] = useState([]);
  const [zones, setZones] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    visitorName: "",
    visitorEmail: "",
    visitorPhone: "",
    organization: "",
    purpose: "",
    zoneId: "",
    scheduledStart: "",
    scheduledEnd: "",
    recurrenceCount: 1,
  });

  async function load() {
    const [visitData, siteData] = await Promise.all([api("/api/v1/visits"), api("/api/v1/sites")]);
    setVisits(visitData.visits);
    setZones(siteData.zones);
    if (!form.zoneId && siteData.zones[0]) setForm((current) => ({ ...current, zoneId: siteData.zones[0].id }));
  }
  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  function setField(key, value) { setForm((current) => ({ ...current, [key]: value })); }

  async function create(event) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/v1/visits", {
        method: "POST",
        body: {
          ...form,
          scheduledStart: new Date(form.scheduledStart).toISOString(),
          scheduledEnd: new Date(form.scheduledEnd).toISOString(),
          recurrenceCount: Number(form.recurrenceCount),
        },
      });
      setForm((current) => ({ ...current, visitorName: "", visitorEmail: "", purpose: "" }));
      await load();
    } catch (err) { setError(err.message); }
  }

  async function cancel(visit) {
    setError("");
    try {
      await api(`/api/v1/visits/${visit.id}/cancel`, { method: "POST", body: { remarks: "Cancelled by host" } });
      await load();
    } catch (err) { setError(err.message); }
  }

  return (
    <Page title="Invitations" kicker="Host">
      <ErrorNote error={error} />
      <div className="grid two">
        <form className="card stack" onSubmit={create}>
          <h2>New visit</h2>
          <label>Visitor name<input value={form.visitorName} onChange={(e) => setField("visitorName", e.target.value)} required /></label>
          <label>Email<input type="email" value={form.visitorEmail} onChange={(e) => setField("visitorEmail", e.target.value)} required /></label>
          <label>Phone<input value={form.visitorPhone} onChange={(e) => setField("visitorPhone", e.target.value)} /></label>
          <label>Organization<input value={form.organization} onChange={(e) => setField("organization", e.target.value)} /></label>
          <label>Purpose<input value={form.purpose} onChange={(e) => setField("purpose", e.target.value)} required /></label>
          <label>Zone
            <select value={form.zoneId} onChange={(e) => setField("zoneId", e.target.value)}>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}{zone.approval_required ? " · approval" : ""}</option>)}
            </select>
          </label>
          <label>Start<input type="datetime-local" value={form.scheduledStart} onChange={(e) => setField("scheduledStart", e.target.value)} required /></label>
          <label>End<input type="datetime-local" value={form.scheduledEnd} onChange={(e) => setField("scheduledEnd", e.target.value)} required /></label>
          <label>Weekly occurrences<input type="number" min="1" max="8" value={form.recurrenceCount} onChange={(e) => setField("recurrenceCount", e.target.value)} /></label>
          <button className="btn" type="submit">Submit visit</button>
        </form>
        <div className="stack">
          {visits.map((visit) => (
            <article className="card" key={visit.id}>
              <div className="split">
                <strong>{visit.visitor.name}</strong>
                <Pill value={visit.status} />
              </div>
              <p>{visit.purpose} · {visit.zone.name}</p>
              {visit.pass && <p className="mono">{visit.pass.code}</p>}
              {!["Inside", "Checked-In", "Checked-Out", "Cancelled"].includes(visit.status) && (
                <button className="btn secondary" type="button" onClick={() => cancel(visit)}>Cancel</button>
              )}
            </article>
          ))}
        </div>
      </div>
    </Page>
  );
}

export function ApprovalsPage() {
  const [visits, setVisits] = useState([]);
  const [remarks, setRemarks] = useState("Approved for the requested window");
  const [error, setError] = useState("");
  async function load() {
    const data = await api("/api/v1/visits?status=Pending%20Approval");
    const held = await api("/api/v1/visits?status=On%20Hold");
    setVisits([...data.visits, ...held.visits]);
  }
  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  async function decide(visit, decision) {
    setError("");
    try {
      await api(`/api/v1/approvals/${visit.id}`, { method: "POST", body: { decision, remarks } });
      await load();
    } catch (err) { setError(err.message); }
  }

  return (
    <Page title="Approval queue" kicker="Approver">
      <ErrorNote error={error} />
      <label>Remark<textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>
      <div className="list" style={{ marginTop: 16 }}>
        {visits.map((visit) => (
          <article className="card" key={visit.id}>
            <div className="split"><strong>{visit.visitor.name}</strong><Pill value={visit.status} /></div>
            <p>{visit.purpose} · {visit.zone.name} · host {visit.host.name}</p>
            <div className="row-actions">
              <button className="btn" type="button" onClick={() => decide(visit, "approve")}>Approve</button>
              <button className="btn danger" type="button" onClick={() => decide(visit, "reject")}>Reject</button>
              <button className="btn secondary" type="button" onClick={() => decide(visit, "escalate")}>Escalate</button>
            </div>
          </article>
        ))}
        {visits.length === 0 && <p className="note">The queue is clear.</p>}
      </div>
    </Page>
  );
}

export function VisitorPage() {
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState(null);
  const [meta, setMeta] = useState(null);
  const [frames, setFrames] = useState(["", ""]);
  const [form, setForm] = useState({ fullName: "", phone: "", organization: "", documentType: "National ID", documentRef: "", consent: false });
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  async function lookup(event) {
    event?.preventDefault();
    setError("");
    try {
      const data = await api(`/api/v1/public/invitations/${encodeURIComponent(code.trim())}`);
      setInvite(data.invitation);
      setMeta(data);
      setForm((current) => ({
        ...current,
        fullName: data.invitation.visitor.name,
        phone: data.invitation.visitor.phone || "",
        organization: data.invitation.visitor.organization || "",
      }));
    } catch (err) { setError(err.message); }
  }

  async function complete(event) {
    event.preventDefault();
    setError("");
    if (!frames[0] || !frames[1]) {
      setError("Capture two frames before enrollment.");
      return;
    }
    try {
      const data = await api(`/api/v1/public/invitations/${encodeURIComponent(code.trim())}/complete`, {
        method: "POST",
        body: { ...form, imageA: frames[0], imageB: frames[1] },
      });
      setDone(data.visit);
      setInvite(data.visit);
    } catch (err) { setError(err.message); }
  }

  return (
    <Page title="Visitor pass" kicker="Visitor">
      <ErrorNote error={error} />
      <form className="card stack no-print" onSubmit={lookup}>
        <label>Invitation code<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VMS-XXXXXXXX" /></label>
        <button className="btn" type="submit">Find invitation</button>
      </form>
      {invite && (
        <form className="card stack" onSubmit={complete} style={{ marginTop: 16 }}>
          <div className="split"><h2>{invite.purpose}</h2><Pill value={invite.status} /></div>
          <p>{invite.site.name} · {invite.zone.name} · host {invite.host.name}</p>
          <PassCard visit={done || invite} />
          <p className="note">Privacy notice {meta?.consentVersion}. Biometric data is used for 1:1 identity verification during this visit and is stored as a protected template reference.</p>
          <label>Full name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
          <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Organization<input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></label>
          <label>Document type<input value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} /></label>
          <label>Document number<input value={form.documentRef} onChange={(e) => setForm({ ...form, documentRef: e.target.value })} required /></label>
          <label><span><input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} /> I consent to identity verification and the stated retention policy.</span></label>
          <CapturePair onChange={setFrames} />
          <button className="btn" type="submit">Save registration and enroll face</button>
        </form>
      )}
    </Page>
  );
}

export function ReceptionPage() {
  const [q, setQ] = useState("");
  const [visits, setVisits] = useState([]);
  const [selected, setSelected] = useState(null);
  const [hosts, setHosts] = useState([]);
  const [zones, setZones] = useState([]);
  const [gates, setGates] = useState([]);
  const [frames, setFrames] = useState(["", ""]);
  const [error, setError] = useState("");
  const [walkIn, setWalkIn] = useState({ visitorName: "", visitorEmail: "", purpose: "Walk-in", hostId: "", zoneId: "", documentType: "National ID", documentRef: "" });

  async function load(query = q) {
    const [visitData, siteData, hostData] = await Promise.all([
      api(`/api/v1/visits${query ? `?q=${encodeURIComponent(query)}` : ""}`),
      api("/api/v1/sites"),
      api("/api/v1/hosts"),
    ]);
    setVisits(visitData.visits);
    setZones(siteData.zones);
    setGates(siteData.gates);
    setHosts(hostData.hosts);
    setWalkIn((current) => ({
      ...current,
      hostId: current.hostId || hostData.hosts[0]?.id || "",
      zoneId: current.zoneId || siteData.zones[0]?.id || "",
    }));
  }
  useEffect(() => { load("").catch((err) => setError(err.message)); }, []);

  async function createWalkIn(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/api/v1/visits/walk-in", { method: "POST", body: walkIn });
      setSelected(data.visit);
      await load();
    } catch (err) { setError(err.message); }
  }

  async function enroll() {
    setError("");
    try {
      await api("/api/v1/face/enroll", {
        method: "POST",
        body: { visitId: selected.id, imageA: frames[0], imageB: frames[1], consent: true },
      });
      const detail = await api(`/api/v1/visits/${selected.id}`);
      setSelected(detail.visit);
    } catch (err) { setError(err.message); }
  }

  return (
    <Page title="Reception" kicker="Desk" actions={<button className="btn secondary" type="button" onClick={() => window.print()}>Print pass</button>}>
      <ErrorNote error={error} />
      <div className="grid two">
        <section className="stack">
          <form className="card row-actions" onSubmit={(event) => { event.preventDefault(); load().catch((err) => setError(err.message)); }}>
            <input placeholder="Name, email, or pass code" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn" type="submit">Search</button>
          </form>
          <VisitTable visits={visits} onSelect={setSelected} />
          <form className="card stack" onSubmit={createWalkIn}>
            <h2>Walk-in</h2>
            <label>Name<input value={walkIn.visitorName} onChange={(e) => setWalkIn({ ...walkIn, visitorName: e.target.value })} required /></label>
            <label>Email<input type="email" value={walkIn.visitorEmail} onChange={(e) => setWalkIn({ ...walkIn, visitorEmail: e.target.value })} required /></label>
            <label>Purpose<input value={walkIn.purpose} onChange={(e) => setWalkIn({ ...walkIn, purpose: e.target.value })} /></label>
            <label>Host<select value={walkIn.hostId} onChange={(e) => setWalkIn({ ...walkIn, hostId: e.target.value })}>{hosts.map((host) => <option key={host.id} value={host.id}>{host.name}</option>)}</select></label>
            <label>Zone<select value={walkIn.zoneId} onChange={(e) => setWalkIn({ ...walkIn, zoneId: e.target.value })}>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
            <label>Document number<input value={walkIn.documentRef} onChange={(e) => setWalkIn({ ...walkIn, documentRef: e.target.value })} /></label>
            <button className="btn" type="submit">Register walk-in</button>
          </form>
        </section>
        <section className="card stack">
          {!selected && <p className="note">Select a visit to capture identity, enroll a face, and print a pass.</p>}
          {selected && (
            <>
              <div className="split"><h2>{selected.visitor.name}</h2><Pill value={selected.status} /></div>
              <PassCard visit={selected} />
              <CapturePair onChange={setFrames} />
              <button className="btn" type="button" onClick={enroll}>Enroll face for this visit</button>
              <GateActions visit={selected} gates={gates} frames={frames} onDone={setSelected} />
            </>
          )}
        </section>
      </div>
    </Page>
  );
}

function GateActions({ visit, gates, frames, onDone }) {
  const { user } = useAuth();
  const [gateId, setGateId] = useState(gates[0]?.id || "");
  const [result, setResult] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gateId && gates[0]?.id) setGateId(gates[0].id);
  }, [gates, gateId]);

  async function validate() {
    setError("");
    try {
      const data = await api("/api/v1/gate/validate", {
        method: "POST",
        body: { code: visit.pass?.code, visitId: visit.id, gateId, imageA: frames[0], imageB: frames[1] },
      });
      setResult(data);
    } catch (err) { setError(err.message); }
  }

  async function checkIn() {
    setError("");
    try {
      const data = await api("/api/v1/gate/check-in", { method: "POST", body: { decisionId: result.decisionId, idempotencyKey: crypto.randomUUID() } });
      onDone?.(data.visit);
      setResult(null);
    } catch (err) { setError(err.message); }
  }

  async function checkOut() {
    setError("");
    try {
      const data = await api("/api/v1/gate/check-out", {
        method: "POST",
        body: { visitId: visit.id, code: visit.pass?.code, gateId, idempotencyKey: crypto.randomUUID() },
      });
      onDone?.(data.visit);
    } catch (err) { setError(err.message); }
  }

  async function override() {
    setError("");
    try {
      const data = await api("/api/v1/gate/override", { method: "POST", body: { decisionId: result.decisionId, gateId, reason } });
      setResult({ ...result, decisionId: data.decisionId, decision: "ALLOW", reasons: [{ code: "MANUAL_OVERRIDE", message: data.note }] });
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="stack no-print">
      <ErrorNote error={error} />
      <label>Checkpoint<select value={gateId} onChange={(e) => setGateId(e.target.value)}>{gates.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}</select></label>
      <div className="row-actions">
        <button className="btn" type="button" onClick={validate}>Validate access</button>
        <button className="btn secondary" type="button" onClick={checkOut}>Check out</button>
      </div>
      {result && (
        <div className={`decision ${result.decision}`}>
          <h2>{result.decision}</h2>
          <p className="mono">{result.correlationId}</p>
          {result.reasons?.length === 0 && <p>All configured validations passed.</p>}
          <ul>{result.reasons?.map((item) => <li key={item.code}>{item.message}</li>)}</ul>
        </div>
      )}
      {result?.decision === "ALLOW" && <button className="btn" type="button" onClick={checkIn}>Record entry and enable access</button>}
      {result && result.decision !== "ALLOW" && can(user, "gate.override") && (
        <div className="stack">
          <label>Override reason<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <button className="btn danger" type="button" onClick={override}>Record privileged override</button>
        </div>
      )}
    </div>
  );
}

export function GatePage() {
  const [code, setCode] = useState("");
  const [gates, setGates] = useState([]);
  const [gateId, setGateId] = useState("");
  const [frames, setFrames] = useState(["", ""]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/api/v1/sites").then((data) => {
      setGates(data.gates);
      setGateId(data.gates[0]?.id || "");
    }).catch((err) => setError(err.message));
  }, []);

  return (
    <Page title="Gate" kicker="Access decision">
      <ErrorNote error={error} />
      <div className="grid two">
        <section className="card stack">
          <label>Pass code<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VMS-XXXXXXXX" /></label>
          <CapturePair onChange={setFrames} />
        </section>
        <section className="card stack">
          {code && (
            <GateActions
              visit={{ id: null, pass: { code: code.trim() } }}
              gates={gateId ? gates : []}
              frames={frames}
              onDone={(visit) => setResult(visit)}
            />
          )}
          {result?.status && <p>Visit is now <Pill value={result.status} />.</p>}
        </section>
      </div>
    </Page>
  );
}

export function SecurityPage() {
  const [entries, setEntries] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [form, setForm] = useState({ fullName: "", documentRef: "", reason: "" });
  const [note, setNote] = useState("False match after document check");
  const [error, setError] = useState("");

  async function load() {
    const [list, alertData] = await Promise.all([api("/api/v1/watchlist"), api("/api/v1/alerts")]);
    setEntries(list.entries);
    setAlerts(alertData.alerts);
  }
  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  async function add(event) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/v1/watchlist", { method: "POST", body: form });
      setForm({ fullName: "", documentRef: "", reason: "" });
      await load();
    } catch (err) { setError(err.message); }
  }

  async function toggle(entry) {
    await api(`/api/v1/watchlist/${entry.id}`, { method: "PATCH", body: { active: !entry.active } });
    await load();
  }

  async function review(alert, disposition) {
    setError("");
    try {
      await api(`/api/v1/alerts/${alert.id}/review`, { method: "POST", body: { disposition, reason: note } });
      await load();
    } catch (err) { setError(err.message); }
  }

  return (
    <Page title="Watchlist" kicker="Security administration">
      <ErrorNote error={error} />
      <div className="grid two">
        <form className="card stack" onSubmit={add}>
          <h2>Restricted entry</h2>
          <label>Name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
          <label>Document number<input value={form.documentRef} onChange={(e) => setForm({ ...form, documentRef: e.target.value })} /></label>
          <label>Reason<textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required /></label>
          <button className="btn" type="submit">Add to watchlist</button>
          <div className="list">
            {entries.map((entry) => (
              <article key={entry.id} className="split">
                <div><strong>{entry.full_name}</strong><div className="note">{entry.reason}</div></div>
                <button className="btn secondary" type="button" onClick={() => toggle(entry)}>{entry.active ? "Deactivate" : "Activate"}</button>
              </article>
            ))}
          </div>
        </form>
        <section className="card stack">
          <h2>Alerts</h2>
          <label>Review note<textarea value={note} onChange={(e) => setNote(e.target.value)} /></label>
          {alerts.map((alert) => (
            <article key={alert.id}>
              <strong>{alert.visitor_name || alert.full_name}</strong> <Pill value={alert.status} />
              <p>{alert.watchlist_reason}</p>
              {alert.status === "open" && (
                <div className="row-actions">
                  <button className="btn" type="button" onClick={() => review(alert, "cleared")}>Clear as false match</button>
                  <button className="btn danger" type="button" onClick={() => review(alert, "confirmed")}>Confirm restriction</button>
                </div>
              )}
            </article>
          ))}
          {alerts.length === 0 && <p className="note">No alerts.</p>}
        </section>
      </div>
    </Page>
  );
}

export function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/api/v1/dashboard").then(setData).catch((err) => setError(err.message)); }, []);
  if (!data) return <Page title="Reports" kicker="Operations"><ErrorNote error={error} /></Page>;
  if (data.scope === "own") {
    return <Page title="My visits" kicker="Reports"><VisitTable visits={data.visits} /></Page>;
  }
  const cards = [
    ["Expected", data.counts.expected],
    ["Inside", data.counts.inside],
    ["Pending", data.counts.pending],
    ["Denied today", data.counts.deniedToday],
    ["Overstay", data.counts.overstay],
    ["Open alerts", data.counts.openAlerts],
  ];
  return (
    <Page title="Operations" kicker="Reports">
      <div className="grid">
        {cards.map(([label, value]) => <article className="card stat" key={label}><span className="note">{label}</span><strong>{value}</strong></article>)}
      </div>
      <div className="grid two" style={{ marginTop: 16 }}>
        <section className="card">
          <h2>On site</h2>
          <table>
            <tbody>
              {data.occupancy.map((row) => (
                <tr key={row.id}><td>{row.visitor_name}</td><td>{row.zone_name}</td><td>{new Date(row.scheduled_end) < new Date() ? "Overstay" : "Within window"}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Occupancy by zone</h2>
          <table>
            <tbody>{data.byZone.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.inside}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </Page>
  );
}

export function AuditPage() {
  const [q, setQ] = useState("");
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  async function load(event) {
    event?.preventDefault();
    try {
      const data = await api(`/api/v1/audit${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setEvents(data.events);
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []);
  return (
    <Page title="Audit trail" kicker="Compliance">
      <ErrorNote error={error} />
      <form className="row-actions" onSubmit={load}>
        <input placeholder="Event, visit, or actor" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" type="submit">Search</button>
      </form>
      <div className="card" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>When</th><th>Event</th><th>Entity</th><th>Detail</th></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.created_at).toLocaleString()}</td>
                <td className="mono">{event.event_type}</td>
                <td>{event.entity_id}</td>
                <td className="note">{event.new_value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

export function AdminPage() {
  const [policies, setPolicies] = useState([]);
  const [users, setUsers] = useState([]);
  const [sites, setSites] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [zone, setZone] = useState({ name: "", siteId: "", approvalRequired: true, faceRequired: true });
  const [person, setPerson] = useState({ name: "", email: "", role: "host", password: "" });
  const [categories, setCategories] = useState([]);
  const [mfaSetup, setMfaSetup] = useState(null);

  async function load() {
    const [policyData, userData, siteData, integrationData, decisionData, categoryData] = await Promise.all([
      api("/api/v1/policies"),
      api("/api/v1/users"),
      api("/api/v1/sites"),
      api("/api/v1/integrations"),
      api("/api/v1/governance/decisions"),
      api("/api/v1/visitor-categories"),
    ]);
    setPolicies(policyData.policies);
    setUsers(userData.users);
    setSites(siteData);
    setIntegrations(integrationData.integrations);
    setDecisions(decisionData.decisions);
    setCategories(categoryData.categories);
    setZone((current) => ({ ...current, siteId: current.siteId || siteData.sites[0]?.id || "" }));
  }
  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  async function savePolicy(item, value) {
    setError("");
    try {
      await api(`/api/v1/policies/${item.key}`, { method: "PUT", body: { value } });
      await load();
    } catch (err) { setError(err.message); }
  }

  async function addZone(event) {
    event.preventDefault();
    await api("/api/v1/zones", { method: "POST", body: zone });
    setZone((current) => ({ ...current, name: "" }));
    await load();
  }

  async function addUser(event) {
    event.preventDefault();
    setError("");
    try {
      const created = await api("/api/v1/users", { method: "POST", body: person });
      setMfaSetup(created.mfaSetup || null);
      setMessage("User created.");
      setPerson({ name: "", email: "", role: person.role, password: "" });
      await load();
    } catch (err) { setError(err.message); }
  }

  async function retention() {
    const data = await api("/api/v1/retention/run", { method: "POST", body: {} });
    setMessage(`Retention job deleted ${data.deleted} enrollment records older than ${data.policyDays} days.`);
  }

  return (
    <Page title="Administration" kicker="Configuration">
      <ErrorNote error={error} />
      {message && <p className="banner ok">{message}</p>}
      <div className="grid two">
        <section className="card stack">
          <h2>Policies</h2>
          {policies.map((item) => (
            <PolicyEditor key={item.key} item={item} onSave={savePolicy} />
          ))}
          <button className="btn secondary" type="button" onClick={retention}>Run retention deletion</button>
        </section>
        <section className="stack">
          <form className="card stack" onSubmit={addZone}>
            <h2>Access zone</h2>
            <label>Name<input value={zone.name} onChange={(e) => setZone({ ...zone, name: e.target.value })} required /></label>
            <label>Site<select value={zone.siteId} onChange={(e) => setZone({ ...zone, siteId: e.target.value })}>{sites?.sites?.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
            <label><span><input type="checkbox" checked={zone.approvalRequired} onChange={(e) => setZone({ ...zone, approvalRequired: e.target.checked })} /> Approval required</span></label>
            <label><span><input type="checkbox" checked={zone.faceRequired} onChange={(e) => setZone({ ...zone, faceRequired: e.target.checked })} /> Face verification required</span></label>
            <button className="btn" type="submit">Add zone</button>
          </form>
          <form className="card stack" onSubmit={addUser}>
            <h2>User</h2>
            <label>Name<input value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} required /></label>
            <label>Email<input type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} required /></label>
            <label>Role
              <select value={person.role} onChange={(e) => setPerson({ ...person, role: e.target.value })}>
                {["host", "reception", "security", "approver", "security_admin", "system_admin", "auditor", "visitor"].map((role) => <option key={role}>{role}</option>)}
              </select>
            </label>
            <label>Password<input type="password" autoComplete="new-password" minLength={10} value={person.password} onChange={(e) => setPerson({ ...person, password: e.target.value })} required /></label>
            <button className="btn" type="submit">Create user</button>
            {mfaSetup && (
              <p className="banner">Authenticator secret, shown once: <span className="mono">{mfaSetup.secret}</span></p>
            )}
          </form>
        </section>
      </div>
      <div className="grid two" style={{ marginTop: 16 }}>
        <section className="card">
          <h2>Users</h2>
          <table>
            <tbody>
              {users.length === 0 && <tr><td>No users found.</td></tr>}
              {users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.roleLabel || user.role}</td><td>{user.disabled ? "Disabled" : "Active"}</td></tr>)}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Visitor categories</h2>
          {categories.length === 0 ? <p>No visitor categories have been configured.</p> : (
            <table><tbody>{categories.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.active ? "Active" : "Inactive"}</td></tr>)}</tbody></table>
          )}
          <h2>Integration adapters</h2>
          <table>
            <tbody>{integrations.map((item) => <tr key={item.id}><td>{item.name}</td><td><Pill value={item.status} /></td><td className="note">{item.detail}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Decisions still open from the design baseline</h2>
        <table>
          <tbody>
            {decisions.map((item) => (
              <tr key={item.id}><td className="mono">{item.id}</td><td>{item.topic}</td><td><Pill value={item.status} /></td><td className="note">{item.note}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </Page>
  );
}

function PolicyEditor({ item, onSave }) {
  const [value, setValue] = useState(item.value);
  const typed = typeof item.value === "boolean" ? "boolean" : typeof item.value === "number" ? "number" : "text";
  return (
    <form className="split" onSubmit={(event) => { event.preventDefault(); onSave(item, typed === "number" ? Number(value) : typed === "boolean" ? value === true || value === "true" : value); }}>
      <label>{item.key}
        {typed === "boolean" ? (
          <select value={String(value)} onChange={(e) => setValue(e.target.value === "true")}>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input value={value} onChange={(e) => setValue(typed === "number" ? Number(e.target.value) : e.target.value)} />
        )}
      </label>
      <button className="btn secondary" type="submit">Save</button>
    </form>
  );
}
