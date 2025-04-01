'use client'

import { Open_Sans } from "next/font/google";
import { cn } from "@/lib/utils";

const font = Open_Sans({ subsets: ['latin'] })

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={cn(font.className, "bg-white dark:bg-[#313338]")}>
        <div className="flex flex-col items-center justify-center h-screen">
          <h2 className="text-xl font-bold mb-4">Something went wrong!</h2>
          <p className="text-sm text-red-500 mb-4">{error.message || "An unexpected error occurred"}</p>
          <button
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded"
            onClick={() => reset()}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
} 