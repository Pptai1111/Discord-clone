'use client'

import { Button } from "@/components/ui/button"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ChannelError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()
  
  useEffect(() => {
    console.error('Channel error:', error)
  }, [error])

  return (
    <div className='bg-zinc-200 dark:bg-[#313338] flex flex-col h-[100vh]'>
      <div className="h-12 border-b-2 border-neutral-200 dark:border-neutral-800 flex items-center px-4">
        <span className="font-semibold text-md">Error</span>
      </div>
      <div className="flex flex-col items-center justify-center flex-1">
        <h2 className="text-xl font-bold mb-4">Error loading channel</h2>
        <p className="text-sm text-red-500 mb-4">
          {error.message || "There was a problem loading this channel"}
        </p>
        <div className="flex gap-4">
          <Button
            onClick={() => reset()}
            className="bg-indigo-500 hover:bg-indigo-600"
          >
            Try again
          </Button>
          <Button
            onClick={() => router.back()}
            variant="outline"
          >
            Go back
          </Button>
        </div>
      </div>
    </div>
  )
} 