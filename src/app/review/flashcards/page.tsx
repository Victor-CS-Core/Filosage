import AppShell from "@/components/AppShell";
import FlashcardStudio from "@/components/flashcards/FlashcardStudio";
import { flashcardFeatureConfiguration } from "@/lib/flashcard-feature";
import { redirect } from "next/navigation";

export default function FlashcardDecksPage() {
  if (!flashcardFeatureConfiguration().decksEnabled) redirect("/review");
  return <AppShell><FlashcardStudio /></AppShell>;
}
