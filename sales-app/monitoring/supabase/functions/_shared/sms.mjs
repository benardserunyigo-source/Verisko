// SMS sender interface: { send(phones: string[], text: string): Promise<void> }.
// Phase 1 ships a console sender. A real provider replaces it at build step 4 without
// touching any other file.
export function consoleSms(log = console.log) {
  return { async send(phones, text) { log(`[sms] to ${phones.join(",")}: ${text}`); } };
}
