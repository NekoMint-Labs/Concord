import { statusLabel, statusTone } from "../ui/labels";

/**
 * The status chip. It carries the label for a domain value and nothing else, so
 * every state in the product is stated the same way wherever it appears - one
 * neutral surface, one exception colour, one word.
 *
 * The words live in `frontend/src/ui/labels.ts`, not here: the same values are
 * read as plain text (a run's state in the timeline heading, a readiness status
 * inside a sentence) and both readers have to agree.
 *
 * The chip used to carry the machine value as its accessible name, which meant a
 * screen reader announced `WAITING_APPROVAL` in a Chinese product - the one place
 * the raw enum outlived the language it was supposed to be hidden behind. The
 * visible label is now the accessible name, and the value it was derived from
 * stays on the element as data for anything that needs the state itself rather
 * than the word for it.
 */
export { statusLabel };

export function Status({ value }: { value: string }) {
  return (
    <span className={`status status-${statusTone(value)}`} data-status={value}>
      {statusLabel(value)}
    </span>
  );
}
