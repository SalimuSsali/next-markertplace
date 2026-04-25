import Link from "next/link";
import { getItemWhatsappHref } from "../lib/whatsappItem";

/**
 * Compact actions for list / grid cards: WhatsApp (if set on the listing) + in-app chat on the item page.
 * @param {{ item: { id?: string } & Record<string, unknown>, compact?: boolean }} props
 */
export function ItemCardChatWaRow({ item, compact = false }) {
  const wa = getItemWhatsappHref(item);
  const id = item?.id != null ? String(item.id) : "";
  if (!id) return null;

  const chatHref = `/items/${id}#seller-chat`;
  const btn =
    "inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-xl border text-center text-xs font-bold no-underline transition active:opacity-90 sm:min-h-[44px] sm:text-sm";

  return (
    <div
      className={`flex gap-2 border-t border-gray-100 bg-white px-2 py-2 ${
        compact ? "flex-col" : "flex-col sm:flex-row"
      }`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100`}
        >
          <span aria-hidden>{"\u{1F4F1}"}</span>
          WhatsApp
        </a>
      ) : null}
      <Link
        href={chatHref}
        className={`${btn} border-blue-300 bg-blue-50 text-blue-950 hover:bg-blue-100`}
      >
        <span aria-hidden>💬</span>
        Chat with seller
      </Link>
    </div>
  );
}
