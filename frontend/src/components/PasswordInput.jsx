import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

// Password input with visibility toggle (eye icon). Drop-in replacement for <Input type="password">.
export const PasswordInput = ({ className = "", ...props }) => {
  const [show, setShow] = useState(false);
  const testid = props["data-testid"] || "password-input";
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={`pr-10 ${className}`} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        data-testid={`${testid}-toggle`}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors !min-h-0 h-6 w-6 flex items-center justify-center"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};

export default PasswordInput;
