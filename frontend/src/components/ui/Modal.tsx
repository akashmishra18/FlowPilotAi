import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

/**
 * Accessible dialog: role="dialog" + aria-modal, labelled by its title,
 * Escape closes, Tab is trapped inside, focus returns to the trigger on
 * close, and page scroll is locked while open.
 */
export default function Modal({ title, description, onClose, children, size = 'md' }: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);

  function requestClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    const closeDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140;
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), closeDelay);
  }

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const first = panel?.querySelector<HTMLElement>('input,select,textarea') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      previouslyFocused?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className={`fp-modal-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4 ${isClosing ? 'is-closing' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={clsx('fp-modal-panel flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-slate-200 bg-panel shadow-2xl sm:rounded-2xl', widths[size], isClosing && 'is-closing')}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3.5 sm:px-5">
          <div>
            <h2 id={titleId} className="font-semibold text-slate-900">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-xs text-slate-600">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close dialog"
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
