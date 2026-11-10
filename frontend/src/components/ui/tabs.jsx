import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef(({ className, ...props }, ref) => {
  const own = React.useRef(null)
  const setRef = (el) => { own.current = el; if (typeof ref === "function") ref(el); else if (ref) ref.current = el }
  // phones: keep the selected tab visible in the swipeable row
  React.useEffect(() => {
    const el = own.current
    if (!el) return
    const show = () => {
      if (el.scrollWidth <= el.clientWidth + 1) return
      const a = el.querySelector('[data-state="active"]')
      if (a) el.scrollLeft = Math.max(0, a.offsetLeft - (el.clientWidth - a.offsetWidth) / 2)
    }
    show()
    const mo = new MutationObserver(show)
    mo.observe(el, { attributes: true, subtree: true, attributeFilter: ["data-state"] })
    return () => mo.disconnect()
  }, [])
  return (
    <TabsPrimitive.List
      ref={setRef}
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        "max-sm:!flex max-sm:!w-full max-sm:!h-auto max-sm:!flex-nowrap max-sm:!justify-start max-sm:overflow-x-auto max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden max-sm:[&>*]:shrink-0",
        className
      )}
      {...props} />
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className
    )}
    {...props} />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
