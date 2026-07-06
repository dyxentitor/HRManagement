import { Skeleton } from "@/components/ui/skeleton"

/** A ghost org tree shown while the chart loads — reads as "a chart is loading". */
export function TreeSkeleton() {
  return (
    <div className="flex flex-col items-center gap-0 p-10">
      <Skeleton className="h-24 w-[252px] rounded-2xl" />
      <div className="h-6 w-px bg-border-subtle" />
      <div className="flex items-start gap-8 border-t border-border-subtle pt-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="-mt-6 flex flex-col items-center">
            <div className="h-6 w-px bg-border-subtle" />
            <Skeleton className="h-24 w-[252px] rounded-2xl" />
          </div>
        ))}
      </div>
    </div>
  )
}
