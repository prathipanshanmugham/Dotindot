import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Phones: every table turns into a list of cards (styles in App.css, "rt-cards"). Each cell is labelled with its
 * column heading; the first real column becomes the card's title, a selection checkbox moves to the corner and an
 * actions column (no heading, or "Actions") becomes a row of buttons. Columns hidden on phones (hidden md:table-cell)
 * stay hidden. Pass cards={false} for grids that only make sense as a grid (timesheets, permission matrices).
 */
// longest run of text in one element (a name over an email reads fine in half a card; a sentence doesn't)
const longest = (el) => {
  let m = 0
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) m = Math.max(m, n.data.trim().length)
  return m
}

const label = (wrap) => {
  const t = wrap && wrap.querySelector(":scope > table")
  if (!t) return
  const heads = []
  const hr = t.querySelectorAll(":scope > thead > tr")
  if (hr.length) {
    for (const th of hr[hr.length - 1].children) {
      const box = th.querySelector('[role="checkbox"],input[type="checkbox"]')
      const txt = (th.textContent || "").replace(/\s+/g, " ").trim()
      for (let i = 0; i < (th.colSpan || 1); i++) heads.push(box ? "" : txt)
    }
  }
  const n = Math.max(1, heads.length)
  for (const tr of t.querySelectorAll(":scope > tbody > tr, :scope > tfoot > tr")) {
    let col = 0, titled = false
    for (const td of tr.children) {
      const span = td.colSpan || 1, head = heads[col] || ""
      col += span
      const text = (td.textContent || "").replace(/\s+/g, " ").trim()
      let kind = "", lab = ""
      if (span >= n || (tr.children.length === 1 && span > 1)) kind = "full"
      else if (td.querySelector('[role="checkbox"],input[type="checkbox"]') && !text.replace(/select|all/gi, "").trim()) kind = "check"
      else if (!head || /^actions$/i.test(head)) kind = td.querySelector("button,a") || !text ? "actions" : (!titled && !td.classList.contains("hidden") ? "title" : "wide")
      else if (!titled && !td.classList.contains("hidden")) kind = "title"
      else if (/^[—–-]?$/.test(text) && !td.querySelector("button,a,input,img,svg,[role]")) kind = "empty"
      else { lab = head; if (text.length > 64 || longest(td) > 30) kind = "wide" }
      if (kind === "title") titled = true
      if (td.getAttribute("data-rt") !== kind) kind ? td.setAttribute("data-rt", kind) : td.removeAttribute("data-rt")
      if ((td.getAttribute("data-label") || "") !== lab) lab ? td.setAttribute("data-label", lab) : td.removeAttribute("data-label")
    }
  }
}

export const useCardTable = (ref, on = true) => {
  React.useLayoutEffect(() => {
    const wrap = ref.current
    if (!on || !wrap || typeof MutationObserver === "undefined") return
    let q = 0
    const run = () => { q = 0; label(wrap) }
    run()
    const mo = new MutationObserver(() => { if (!q) q = requestAnimationFrame(run) })
    mo.observe(wrap, { childList: true, subtree: true, characterData: true })
    return () => { mo.disconnect(); if (q) cancelAnimationFrame(q) }
  }, [ref, on])
}

/** Wrap a plain <table> to get the same phone cards: <CardTable><table>…</table></CardTable> */
export const CardTable = ({ className, children, cards = true, ...props }) => {
  const wrap = React.useRef(null)
  useCardTable(wrap, cards)
  return <div ref={wrap} className={cn("relative w-full overflow-auto", cards && "rt-cards", className)} {...props}>{children}</div>
}

const Table = React.forwardRef(({ className, cards = true, ...props }, ref) => {
  const wrap = React.useRef(null)
  useCardTable(wrap, cards)
  return (
    <div ref={wrap} className={cn("relative w-full overflow-auto", cards && "rt-cards")}>
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props} />
    </div>
  )
})
Table.displayName = "Table"

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props} />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props} />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props} />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props} />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props} />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props} />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
