import { useState, type ReactNode } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { searchTextMatches } from "@/lib/search-text";

/**
 * Minimal stand-in for the licensing guide's SearchableAccordion
 * (agent bc-d319cb04). Swap this import when that component is on main.
 * Sections start closed. A search match opens itself.
 */
export type SearchableAccordionItem = {
  id: string;
  title: string;
  searchText: string;
  content: ReactNode;
};

export function SearchableAccordion({
  items,
  label,
  placeholder,
  empty,
  children,
}: {
  items: readonly SearchableAccordionItem[];
  label: string;
  placeholder: string;
  empty: string;
  /** Sits between the search box and the sections. Use it for a picker. */
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState<string[]>([]);
  const filtering = query.trim().length > 0;
  const visible = filtering
    ? items.filter((item) => searchTextMatches(query, `${item.title}\n${item.searchText}`))
    : items;
  const open = filtering ? visible.map((item) => item.id) : opened;

  return (
    <div data-ke="searchable-accordion">
      <label className="block text-sm font-medium">
        {label}
        <input
          className="ke-input mt-1 min-h-11 w-full"
          type="search"
          value={query}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
          autoComplete="off"
        />
      </label>
      {children ? <div className="mt-4">{children}</div> : null}
      {visible.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-muted" role="status">
          {empty}
        </p>
      ) : (
        <Accordion.Root
          type="multiple"
          value={open}
          onValueChange={setOpened}
          className="mt-4 space-y-2"
        >
          {visible.map((item) => (
            <Accordion.Item
              key={item.id}
              value={item.id}
              className="overflow-hidden rounded-xl bg-surface ring-1 ring-border"
            >
              <Accordion.Header>
                <Accordion.Trigger className="group flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-base font-semibold touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                  <span>{item.title}</span>
                  <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="px-4 pb-4 text-sm leading-6">
                {item.content}
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      )}
    </div>
  );
}
