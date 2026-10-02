import React, {
  type ComponentPropsWithRef,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import './selector.css';

export type SelectProps = ComponentPropsWithRef<'select'> & {
  variant?: 'default' | 'form' | 'resource';
  label?: ReactNode;
  fieldClassName?: string;
};

const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();

/** Retains the native control for forms, validation, refs and change events. */
export function Select({
  variant = 'default',
  className,
  label,
  fieldClassName,
  id,
  ref,
  onMouseDown,
  onClick,
  onKeyDown,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const nativeRef = useRef<HTMLSelectElement | null>(null);
  const popupRef = useRef<HTMLDialogElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<HTMLOptionElement[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const filtered = options.filter((option) => normalize(option.label).includes(normalize(query)));
  const enabled = filtered.filter(
    (option) =>
      !option.disabled &&
      !(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled)
  );
  const activeOption = enabled[active];
  const listId = `${selectId}-options`;

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) return;
      popupRef.current?.hidePopover();
    };
    const width = window.innerWidth;
    const dismissOnWidthChange = (event: Event) => {
      if (window.innerWidth !== width) dismiss(event);
    };
    window.addEventListener('resize', dismissOnWidthChange);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', dismissOnWidthChange);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);

  function close() {
    popupRef.current?.hidePopover();
    nativeRef.current?.focus();
  }

  function choose(option: HTMLOptionElement) {
    const select = nativeRef.current;
    if (!select) return;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  }

  function show(initialQuery = '') {
    const select = nativeRef.current;
    const popup = popupRef.current;
    if (!select || !popup || select.matches(':disabled') || props.multiple || (props.size ?? 0) > 1)
      return;
    const rect = select.getBoundingClientRect();
    const below = Math.max(0, window.innerHeight - rect.bottom - 8);
    // The search replaces the visible selection; only the results extend below it.
    popup.style.width = `${rect.width}px`;
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.top}px`;
    popup.style.bottom = 'auto';
    popup.style.maxHeight = `${rect.height + below}px`;
    popup.style.setProperty('--select-field-height', `${rect.height}px`);
    setOptions(Array.from(select.options));
    setQuery(initialQuery);
    setActive(0);
    popup.showPopover();
    searchRef.current?.focus();
  }

  const select = (
    <>
      <select
        {...props}
        ref={(node) => {
          nativeRef.current = node;
          if (typeof ref === 'function') return ref(node);
          if (ref) ref.current = node;
        }}
        id={selectId}
        className={['rcl-select', `rcl-select--${variant}`, className].filter(Boolean).join(' ')}
        onMouseDown={(event) => {
          onMouseDown?.(event);
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            props.multiple ||
            (props.size ?? 0) > 1
          )
            return;
          event.preventDefault();
        }}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) show();
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (
            event.defaultPrevented ||
            props.multiple ||
            (props.size ?? 0) > 1 ||
            event.ctrlKey ||
            event.metaKey
          )
            return;
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            show();
          } else if (event.key.length === 1 && !event.altKey) {
            event.preventDefault();
            show(event.key);
          }
        }}
      />
      <dialog
        ref={popupRef}
        popover="auto"
        className={`rcl-select-popup rcl-select-popup--${variant}`}
        aria-label="Buscar opciones"
        onToggle={(event) => setOpen(event.newState === 'open')}
      >
        <input
          ref={searchRef}
          type="text"
          role="combobox"
          aria-label="Buscar opciones"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            activeOption ? `${listId}-${options.indexOf(activeOption)}` : undefined
          }
          className="rcl-select-search"
          placeholder="Buscar…"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
            if (event.key === 'Tab') close();
            if (event.key === 'Enter') {
              event.preventDefault();
              if (activeOption) choose(activeOption);
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const next = enabled.length
                ? (active + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
                : 0;
              setActive(next);
              const nextOption = enabled[next];
              if (nextOption)
                document
                  .getElementById(`${listId}-${options.indexOf(nextOption)}`)
                  ?.scrollIntoView({ block: 'nearest' });
            }
          }}
        />
        <div className="rcl-select-results">
          {/* biome-ignore lint/a11y/useSemanticElements: Custom listbox keeps keyboard focus in the search combobox. */}
          <div id={listId} role="listbox" tabIndex={-1} aria-label="Opciones">
            {filtered.map((option) => (
              <div
                key={options.indexOf(option)}
                id={`${listId}-${options.indexOf(option)}`}
                // biome-ignore lint/a11y/useSemanticElements: Options belong to the custom searchable listbox.
                role="option"
                tabIndex={-1}
                aria-selected={option.selected}
                aria-disabled={!enabled.includes(option)}
                className={option === activeOption ? 'is-active' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (enabled.includes(option)) choose(option);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && enabled.includes(option)) choose(option);
                }}
              >
                {option.parentElement instanceof HTMLOptGroupElement && (
                  <small>{option.parentElement.label} · </small>
                )}
                {option.label}
                {option.selected && <span aria-hidden="true"> ✓</span>}
              </div>
            ))}
          </div>
          {filtered.length === 0 && <output>Sin resultados</output>}
        </div>
      </dialog>
    </>
  );

  if (label == null) return select;

  return (
    <div
      className={['rcl-select-field', variant === 'default' && 'select-field', fieldClassName]
        .filter(Boolean)
        .join(' ')}
    >
      <label className="rcl-select-label" htmlFor={selectId}>
        {label}
      </label>
      {select}
    </div>
  );
}
