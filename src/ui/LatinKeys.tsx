/* Latin length marks are painful to type on iOS and macOS — a web page cannot
 * change what the OS keyboard's long-press offers, so the app provides the keys
 * itself. Inserts at the caret of whichever text field currently has focus:
 * onMouseDown preventDefault keeps that focus, and writing through the native
 * value setter + an input event is what controlled React inputs listen for. */
const LONG = ["ā", "ē", "ī", "ō", "ū"];
const SHORT = ["ă", "ĕ", "ĭ", "ŏ", "ŭ"];

function insertAtCaret(ch: string) {
  const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const next = el.value.slice(0, start) + ch + el.value.slice(end);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  if (setter) setter.call(el, next); else el.value = next;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = start + ch.length;
  el.setSelectionRange(caret, caret);
}

export function LatinKeys({ hint }: { hint?: string }) {
  return (
    <div className="latin-keys">
      {[...LONG, ...SHORT].map((ch) => (
        <button key={ch} type="button" className="latin-key" title={`${ch} einfügen`}
          onMouseDown={(e) => e.preventDefault()} onClick={() => insertAtCaret(ch)}>{ch}</button>
      ))}
      {hint && <span className="latin-keys-hint">{hint}</span>}
    </div>
  );
}
