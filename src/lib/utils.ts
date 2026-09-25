import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(input?: string | Date | null) {
  if (!input) return "Unknown";
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatTime(input: string | Date) {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Formats a calendar-day value stored as UTC midnight without shifting it into the viewer's timezone. */
export function formatDay(input?: string | Date | null) {
  if (!input) return "Unknown";
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

/** A calendar-day deadline is overdue only once that UTC day has fully elapsed. */
export function isDayOverdue(day: Date, now: Date) {
  return day.getTime() + 86_400_000 <= now.getTime();
}
