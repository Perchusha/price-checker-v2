import * as React from "react";
import { cn } from "../../lib/utils";

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground",
        className
      )}
      {...props}
    />
  )
);
Alert.displayName = "Alert";

export { Alert };
