export type Gender = "man" | "woman" | "other";

export type Profile = {
  id: string;
  name: string;
  birthdate: string;
  height_cm: number;
  gender: Gender;
  seeking: Gender[];
  open_to_more: boolean;
  paused: boolean;
};

export type Photo = {
  id: string;
  user_id: string;
  path: string;
  position: number;
};

export type Conversation = {
  id: string;
  user_a: string;
  user_b: string;
  status: "active" | "ended" | "off_app";
  overflow_for: string | null;
  created_at: string;
  ended_at: string | null;
  ended_by: string | null;
  end_reason: "ended" | "ghosted" | "reported" | "off_app" | null;
  off_app_a: boolean;
  off_app_b: boolean;
  closed_a: boolean;
  closed_b: boolean;
};

export type Message = {
  id: number;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type MatchRequest = {
  id: number;
  created_at: string;
  matched_at: string | null;
  cancelled_at: string | null;
};

export const GENDER_LABELS: Record<Gender, string> = {
  man: "Man",
  woman: "Woman",
  other: "Other",
};

export const SEEKING_LABELS: Record<Gender, string> = {
  man: "Men",
  woman: "Women",
  other: "Other",
};

export function partnerId(c: Conversation, me: string) {
  return c.user_a === me ? c.user_b : c.user_a;
}

export function age(birthdate: string) {
  const b = new Date(birthdate + "T00:00:00");
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

export function height(cm: number) {
  const totalIn = Math.round(cm / 2.54);
  return `${Math.floor(totalIn / 12)}′${totalIn % 12}″`;
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
