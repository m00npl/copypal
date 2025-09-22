import * as React from "react"
import { DayPicker } from "react-day-picker"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium text-[#E6EAF2]",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-[#273244] border-[#3a465a] p-0 text-[#9AA7BD] hover:text-[#E6EAF2] hover:bg-[#334155]"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-[#9AA7BD] rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-[#273244]/50 [&:has([aria-selected])]:bg-[#273244] first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal text-[#E6EAF2] hover:bg-[#273244] hover:text-[#E6EAF2] aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-[#20C15A] text-white hover:bg-[#20C15A] hover:text-white focus:bg-[#20C15A] focus:text-white",
        day_today: "bg-[#273244] text-[#E6EAF2]",
        day_outside:
          "day-outside text-[#9AA7BD] opacity-50 aria-selected:bg-[#273244]/50 aria-selected:text-[#9AA7BD] aria-selected:opacity-30",
        day_disabled: "text-[#9AA7BD] opacity-50",
        day_range_middle:
          "aria-selected:bg-[#273244] aria-selected:text-[#E6EAF2]",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => (
          <div className="h-4 w-4">
            {orientation === "left" ? "‹" : "›"}
          </div>
        ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }