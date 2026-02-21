"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { StopCircle, Loader2 } from "lucide-react";

export function CancelButton() {
  const { pending } = useFormStatus();
  return (
    <Button 
      variant="ghost" 
      size="sm" 
      type="submit" 
      disabled={pending} 
      className="text-red-500 hover:text-red-400 hover:bg-red-500/10 h-8 px-2"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
      ) : (
        <StopCircle className="h-4 w-4 mr-1" />
      )}
      {pending ? "Stopping..." : "Stop"}
    </Button>
  );
}
