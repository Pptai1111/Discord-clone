'use client'

import { Button } from "@/components/ui/button"
import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)]">
      <h2 className="text-xl font-bold mb-4">Something went wrong!</h2>
      <p className="text-sm text-red-500 mb-4">
        {error.message || "An error occurred while loading this page"}
      </p>
      <Button
        onClick={() => reset()}
        className="bg-indigo-500 hover:bg-indigo-600"
      >
        Try again
      </Button>
    </div>
  )
} 