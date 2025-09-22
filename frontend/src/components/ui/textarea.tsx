import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-lg border border-[#273244] bg-[#0B0F1A] px-3 py-2 text-sm text-[#E6EAF2] placeholder:text-[#9AA7BD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#20C15A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0F1A] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }