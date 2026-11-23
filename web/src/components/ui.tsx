"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { usePhotoUrl } from "@/lib/hooks";

export function Screen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`mx-auto flex w-full max-w-md flex-1 flex-col px-4 ${className}`}>{children}</main>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight text-ink">
      <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
      </span>
      Connections
    </Link>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-brand text-white shadow-[0_8px_20px_-8px_oklch(0.5_0.19_300/0.55)] hover:bg-brand-strong",
    secondary: "border border-line bg-white text-ink hover:bg-lav",
    ghost: "text-brand-strong hover:bg-lav",
    danger: "border border-line bg-white text-danger hover:bg-lav",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function Avatar({ path, size = 56, label }: { path?: string | null; size?: number; label: string }) {
  const url = usePhotoUrl(path);
  return (
    <div
      className="shrink-0 overflow-hidden rounded-2xl bg-brand-soft"
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="h-full w-full object-cover" />
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-1 items-center justify-center py-20 text-muted">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-soft border-t-brand" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-2xl bg-[oklch(0.96_0.03_25)] px-4 py-3 text-sm text-danger">
      {children}
    </p>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{label}</span>
        {hint && <span className="text-[13.5px] leading-snug text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className="relative mt-0.5 h-7 w-12 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-brand after:absolute after:top-0.5 after:left-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-[oklch(0.2_0.02_300/0.35)]" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-[28px] bg-white px-5 pt-5 pb-8 shadow-xl sm:rounded-[28px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-lav">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ThumbsPicker({ value, onChange }: { value: "up" | "down" | null; onChange: (v: "up" | "down") => void }) {
  const option = (v: "up" | "down", label: string) => (
    <button
      type="button"
      aria-pressed={value === v}
      onClick={() => onChange(v)}
      className={`flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border text-[15px] font-bold transition-colors ${
        value === v ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-white text-ink hover:bg-lav"
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: v === "down" ? "rotate(180deg)" : undefined }}>
        <path d="M7 10v11H4V10h3zM7 10l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.4 9A2 2 0 0 1 17.6 21H7" />
      </svg>
      {label}
    </button>
  );
  return (
    <div className="flex gap-3">
      {option("up", "Good")}
      {option("down", "Not for me")}
    </div>
  );
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-10 rounded-full border px-4 text-[14px] font-semibold transition-colors ${
        selected ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-white text-ink hover:bg-lav"
      }`}
    >
      {children}
    </button>
  );
}
