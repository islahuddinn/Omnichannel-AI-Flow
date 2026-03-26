// src/components/ui/visually-hidden.jsx
import * as React from "react"
import * as VisuallyHiddenPrimitive from "@radix-ui/react-visually-hidden"

const VisuallyHidden = React.forwardRef(({ ...props }, ref) => (
  <VisuallyHiddenPrimitive.Root ref={ref} {...props} />
))
VisuallyHidden.displayName = "VisuallyHidden"

export { VisuallyHidden }

