import type { SupportCategory } from "./types";

export const supportCategories: SupportCategory[] = [
  { id: "start", label: "Getting started", description: "Find your way around Filosage and begin learning." },
  { id: "courses", label: "Courses and lessons", description: "Choose a course, follow its path, and complete lessons." },
  { id: "practice", label: "Practice and review", description: "Use study tools and return to material at the right time." },
  { id: "progress", label: "Progress and evidence", description: "Understand the learning record and saved evidence." },
  { id: "account", label: "Account and access", description: "Manage your profile and resolve sign-in problems." },
  { id: "trust", label: "Privacy, safety, and accessibility", description: "Control your information and report concerns." },
  { id: "plans", label: "Plans and support", description: "Check the current billing status or contact support." },
];

export function getSupportCategory(id: string) {
  return supportCategories.find((category) => category.id === id);
}
