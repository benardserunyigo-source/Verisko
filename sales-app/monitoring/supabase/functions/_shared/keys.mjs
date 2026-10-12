// Access keys for boxes, the email script, the app's API calls and the watcher.
// Only a SHA-256 hash of a key is ever stored. Works in Node 20+ and Deno.

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function generateKey(kind) {
  return `vsk_${kind}_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export async function hashKey(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bearerToken(request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "");
  return match ? match[1] : null;
}
