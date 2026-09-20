import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };

export function Input({ label, error, id, className, ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-[#141414]">{label}</label>
      <input id={inputId} className={cn("w-full border border-[#e4e4e2] bg-white px-3 py-2.5 text-sm text-[#141414] outline-none focus:border-[#1f4e3d]", error && "border-red-600", className)} {...props} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
