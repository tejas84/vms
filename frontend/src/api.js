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

export async function api(path, { method = "GET", body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined) requestHeaders["content-type"] = "application/json";
  const token = getToken();
  if (token) requestHeaders.authorization = `Bearer ${token}`;
  const response = await fetch(path, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || "Request failed");
    error.code = data?.error?.code;
    error.status = response.status;
    error.correlationId = data?.error?.correlationId;
    throw error;
  }
  return data;
}
