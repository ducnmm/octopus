import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button.js";

/** Copy-to-clipboard with transient confirmation (replaces the data-copy-text script). */
export const CopyButton = ({ text, label = "Copy" }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context); leave the button as-is.
    }
  };

  return (
    <Button type="button" variant="ghost" size="icon-sm" title={label} aria-label={label} onClick={() => void copy()}>
      {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
    </Button>
  );
};
