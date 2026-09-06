import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "../ui/workspace";
export const Route = createFileRoute("/")({ component: Workspace });
