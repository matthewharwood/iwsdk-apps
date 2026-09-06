import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { appConfig } from "../app.config";
import { NotFound, RouteError } from "../ui/route-boundaries";
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: appConfig.title },
      {
        name: "description",
        content: "A local-first WebXR application starter with a shared desktop and VR scene.",
      },
    ],
    links: [
      {
        rel: "icon",
        href: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"%3E%3Crect width="32" height="32" rx="8" fill="%2384e1bc"/%3E%3C/svg%3E',
      },
    ],
  }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
  errorComponent: RouteError,
  notFoundComponent: NotFound,
});
