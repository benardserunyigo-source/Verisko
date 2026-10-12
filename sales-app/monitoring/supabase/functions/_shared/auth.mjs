import { bearerToken, hashKey } from "./keys.mjs";
import { json } from "./http.mjs";

// Returns { key } when the bearer token is a live key of one of the allowed kinds,
// otherwise { response } holding the error to return.
export async function authenticate(request, repo, allowedKinds) {
  const token = bearerToken(request);
  if (!token) return { response: json(401, { error: "missing key" }) };
  const key = await repo.findKey(await hashKey(token));
  if (!key || key.revokedAt) return { response: json(401, { error: "bad key" }) };
  if (!allowedKinds.includes(key.kind)) return { response: json(403, { error: "this key cannot do that" }) };
  return { key };
}
