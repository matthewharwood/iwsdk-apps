export async function prepareOffline(): Promise<string> {
  if (import.meta.env.DEV) return "Available after a production build";
  if (!("serviceWorker" in navigator)) return "Offline loading unavailable";
  const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  });
  await navigator.serviceWorker.ready;
  return registration.waiting ? "Update ready for next session" : "Ready on this device";
}
