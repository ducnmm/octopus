import type { PullRequest } from "@ducnmm/octopus-shared";
import { Badge } from "@/components/ui/badge.js";

const STATUS_CLASSES: Record<PullRequest["status"], string> = {
  open: "bg-emerald-600 text-white",
  merged: "bg-violet-600 text-white",
  closed: "bg-red-600 text-white"
};

export const PullStatusBadge = ({ status }: { status: PullRequest["status"] }) => (
  <Badge className={`capitalize ${STATUS_CLASSES[status]}`}>{status}</Badge>
);
