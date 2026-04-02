import { cn } from "@/lib/utils"
import { type HTMLAttributes } from "react"

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  delay?: number
}

export function Skeleton({ className, delay = 0, style, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton", className)}
      style={{ animationDelay: `${delay}ms`, ...style }}
      {...props}
    />
  )
}

export function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <div className="card p-5 md:p-6" style={{ animationDelay: `${delay}ms` }}>
      <Skeleton className="mb-3 h-4 w-1/3" delay={delay} />
      <Skeleton className="h-8 w-1/2" delay={delay + 60} />
      <Skeleton className="mt-3 h-3 w-full" delay={delay + 120} />
      <Skeleton className="mt-2 h-3 w-2/3" delay={delay + 180} />
    </div>
  )
}

export function SkeletonText({ lines = 3, delay = 0 }: { lines?: number; delay?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
          delay={delay + i * 60}
        />
      ))}
    </div>
  )
}

export function SkeletonPsychologistCard({ delay = 0 }: { delay?: number }) {
  return (
    <div className="card p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start gap-3">
        <Skeleton className="h-12 w-12 shrink-0 rounded-full" delay={delay} />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" delay={delay + 40} />
          <Skeleton className="h-3 w-1/3" delay={delay + 80} />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" delay={delay + 60} />
      </div>
      <Skeleton className="mt-4 h-3 w-full" delay={delay + 120} />
      <Skeleton className="mt-2 h-3 w-4/5" delay={delay + 160} />
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-5 w-1/4" delay={delay + 200} />
        <Skeleton className="h-4 w-1/5" delay={delay + 240} />
      </div>
    </div>
  )
}
