import { useEffect, useRef, useState } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { fileToDataUrl } from "../api/client";

export function CapturePair({ onChange }) {
  const videoRef = useRef(null);
  const [cameraError, setCameraError] = useState("");

  useEffect(() => () => {
    const stream = videoRef.current?.srcObject;
    stream?.getTracks?.().forEach((track) => track.stop());
  }, []);

  async function start() {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    } catch {
      setCameraError("Camera is unavailable. Upload two different frames instead.");
    }
  }

  function snap(index, current) {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 360;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0, 480, 360);
    const next = [...current];
    next[index] = canvas.toDataURL("image/jpeg", 0.85);
    onChange(next);
    return next;
  }

  const [frames, setFrames] = useState(["", ""]);

  return (
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">Capture two slightly different frames. The same image twice is rejected when liveness is enabled.</Typography>
      {cameraError && <Alert severity="warning">{cameraError}</Alert>}
      <video ref={videoRef} width="320" height="240" style={{ background: "#0B1F33", maxWidth: "100%" }} />
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Button variant="outlined" onClick={start}>Start camera</Button>
        <Button variant="outlined" onClick={() => setFrames(snap(0, frames))}>Frame A</Button>
        <Button variant="outlined" onClick={() => setFrames(snap(1, frames))}>Frame B</Button>
      </Stack>
      <Button component="label" variant="text">
        Upload frames
        <input
          hidden
          type="file"
          accept="image/*"
          multiple
          onChange={async (event) => {
            const files = [...event.target.files].slice(0, 2);
            const urls = await Promise.all(files.map(fileToDataUrl));
            const next = [urls[0] || "", urls[1] || ""];
            setFrames(next);
            onChange(next);
          }}
        />
      </Button>
      <Typography variant="body2">{frames.filter(Boolean).length} of 2 frames ready.</Typography>
    </Stack>
  );
}
