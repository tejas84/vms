import axios from "axios";

const TOKEN_KEY = "vms_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export const api = axios.create();

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error?.message || "Unable to complete the request.";
    const wrapped = new Error(message);
    wrapped.status = error.response?.status;
    wrapped.code = error.response?.data?.error?.code;
    wrapped.correlationId = error.response?.data?.error?.correlationId;
    return Promise.reject(wrapped);
  },
);

export async function fileToDataUrl(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:${file.type || "image/jpeg"};base64,${btoa(binary)}`;
}
