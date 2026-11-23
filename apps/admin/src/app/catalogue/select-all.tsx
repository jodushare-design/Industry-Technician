"use client";

/** Toggles every "ids" checkbox in the enclosing form (bulk approve a page of records). */
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Select all on this page"
      onChange={(e) => {
        const form = e.currentTarget.form;
        form?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="ids"]').forEach((cb) => {
          cb.checked = e.currentTarget.checked;
        });
      }}
    />
  );
}
