import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="flex h-16 items-center gap-4 border-b border-border/40 px-6">
        <Skeleton className="h-7 w-32" />
        <div className="ml-auto hidden gap-3 md:flex">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-20" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-16">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="mt-10 h-72 w-full" />
      </main>
    </div>
  )
}
