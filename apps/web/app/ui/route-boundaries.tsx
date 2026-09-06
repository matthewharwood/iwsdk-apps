import { type ErrorComponentProps, Link } from "@tanstack/react-router";
export function NotFound() {
  return (
    <main className="route-message">
      <h1>Page not found</h1>
      <Link to="/">Return to the table</Link>
    </main>
  );
}
export function RouteError({ error, reset }: ErrorComponentProps) {
  if (import.meta.env.SSR) throw error;
  return (
    <main className="route-message">
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
