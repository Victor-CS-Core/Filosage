"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Moon, Search, Sun, X, type LucideIcon } from "lucide-react";
import { matchesSearchQuery } from "@/lib/search";

export interface CommandPaletteItem {
  id: string;
  section: "Navigate" | "Account";
  label: string;
  description: string;
  href?: string;
  action?: "open-courses" | "sign-out";
  keywords?: string;
  icon: LucideIcon;
  tone: "teal" | "blue" | "coral" | "gold" | "slate";
}

interface CommandPaletteProps {
  open: boolean;
  items: CommandPaletteItem[];
  theme: "light" | "dark";
  onClose: () => void;
  onSelect: (item: CommandPaletteItem) => void;
  onToggleTheme: () => void;
}

function commandOptionId(itemId: string) {
  return `command-${itemId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export default function CommandPalette({ open, items, theme, onClose, onSelect, onToggleTheme }: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredItems = useMemo(() => {
    return items.filter((item) => matchesSearchQuery(query, [item.label, item.description, item.section, item.keywords]));
  }, [items, query]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  const currentActiveIndex = Math.min(activeIndex, Math.max(filteredItems.length - 1, 0));

  useEffect(() => {
    const activeItem = filteredItems[currentActiveIndex];
    if (!activeItem) return;
    document.getElementById(commandOptionId(activeItem.id))?.scrollIntoView({ block: "nearest" });
  }, [currentActiveIndex, filteredItems]);

  const choose = (item: CommandPaletteItem) => {
    onSelect(item);
  };

  return (
    <dialog
      id="command-palette"
      ref={dialogRef}
      className="command-palette"
      aria-labelledby="command-palette-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button className="command-palette-backdrop" type="button" tabIndex={-1} onClick={onClose} aria-label="Close Command Center by clicking outside" />
      <section className="command-palette-surface">
        <header className="command-palette-search">
          <Search size={19} aria-hidden="true" />
          <span className="sr-only" id="command-palette-title">Filosage Command Center</span>
          <label className="sr-only" htmlFor="command-palette-input">Search Filosage</label>
          <input
            id="command-palette-input"
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => filteredItems.length ? (index + 1) % filteredItems.length : 0);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => filteredItems.length ? (index - 1 + filteredItems.length) % filteredItems.length : 0);
              } else if (event.key === "Enter" && filteredItems[currentActiveIndex]) {
                event.preventDefault();
                choose(filteredItems[currentActiveIndex]);
              }
            }}
            placeholder="Search pages and actions"
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="command-palette-results"
            aria-activedescendant={filteredItems[currentActiveIndex] ? commandOptionId(filteredItems[currentActiveIndex].id) : undefined}
          />
          <kbd>Esc</kbd>
          <button className="command-palette-close" type="button" onClick={onClose} aria-label="Close Command Center"><X size={17} /></button>
        </header>

        <div className="command-palette-results" id="command-palette-results" role="listbox" aria-label="Filosage commands">
          {filteredItems.length > 0 ? filteredItems.map((item, index) => {
            const Icon = item.icon;
            const startsSection = index === 0 || filteredItems[index - 1].section !== item.section;
            return (
              <div className="command-palette-row" key={item.id}>
                {startsSection && <p>{item.section}</p>}
                <button
                  id={commandOptionId(item.id)}
                  type="button"
                  role="option"
                  aria-selected={index === currentActiveIndex}
                  className={`${index === currentActiveIndex ? "is-active" : ""} command-tone-${item.tone}`.trim()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(item)}
                >
                  <span className="command-palette-icon" data-tone={item.tone}><Icon size={17} aria-hidden="true" /></span>
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            );
          }) : (
            <div className="command-palette-empty" role="status">
              <Search size={21} aria-hidden="true" />
              <strong>No matching destination</strong>
              <p>Try a page name or an action such as “create.”</p>
            </div>
          )}
        </div>

        <footer className="command-palette-footer">
          <div className="command-palette-hints" aria-hidden="true">
            <span><kbd>↑</kbd><kbd>↓</kbd> Move</span>
            <span><kbd>Enter</kbd> Open</span>
            <span><kbd>Ctrl</kbd><kbd>K</kbd> Anywhere</span>
          </div>
          <button
            className="command-theme-toggle"
            type="button"
            role="switch"
            aria-checked={theme === "dark"}
            aria-label="Dark mode"
            onClick={onToggleTheme}
          >
            <span className="command-theme-label"><Sun size={14} aria-hidden="true" /> Light</span>
            <span className="command-theme-track" aria-hidden="true"><i /></span>
            <span className="command-theme-label"><Moon size={14} aria-hidden="true" /> Dark</span>
            <span className="sr-only">{theme === "dark" ? "On" : "Off"}</span>
          </button>
        </footer>
      </section>
    </dialog>
  );
}
