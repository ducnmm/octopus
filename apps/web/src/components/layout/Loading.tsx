import { Skeleton } from "@/components/ui/skeleton.js";

export const Loading = ({ lines = 4 }: { lines?: number }) => (
  <div className="space-y-3" role="status" aria-label="Loading">
    <Skeleton className="h-8 w-1/3" />
    {Array.from({ length: lines }, (_, index) => (
      <Skeleton key={index} className="h-5 w-full" />
    ))}
  </div>
);
