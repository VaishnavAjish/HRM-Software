import { useEffect, useRef } from "react";
import { Bold, Italic, List, ListOrdered, Heading2 } from "lucide-react";

const TOOLBAR_BUTTONS = [
  { command: "bold", icon: Bold, label: "Bold" },
  { command: "italic", icon: Italic, label: "Italic" },
  { command: "insertUnorderedList", icon: List, label: "Bullet list" },
  { command: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
  { command: "formatBlock:H2", icon: Heading2, label: "Heading" },
];

/**
 * A minimal rich-text field: contentEditable + a small execCommand-driven
 * toolbar. No react-quill/tiptap/etc — this environment can't reliably run
 * an `npm install` (the UNC-path dev server issues documented elsewhere in
 * this project), so a new heavy editor dependency would be unverifiable.
 * `execCommand` is deprecated but still broadly supported in Chromium for
 * exactly these basic operations, which is all an internal JD editor needs.
 *
 * `value`/`onChange` carry HTML strings. The DOM, not React, owns the
 * contentEditable's content on every keystroke — only re-synced from `value`
 * when it changes for a reason other than this field's own typing (e.g.
 * switching which requisition is being edited), so the cursor never jumps.
 */
export default function RichTextEditor({ value, onChange, placeholder, minHeight = 96, className = "" }) {
  const ref = useRef(null);
  const lastEmitted = useRef(value);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (ref.current) {
      if (isFirstMount.current || value !== lastEmitted.current) {
        ref.current.innerHTML = value || "";
        lastEmitted.current = value;
        isFirstMount.current = false;
      }
    }
  }, [value]);

  const exec = (command) => {
    ref.current?.focus();
    if (command.startsWith("formatBlock:")) {
      document.execCommand("formatBlock", false, command.split(":")[1]);
    } else {
      document.execCommand(command, false, null);
    }
    handleInput();
  };

  const handleInput = () => {
    const html = ref.current?.innerHTML || "";
    lastEmitted.current = html;
    onChange(html);
  };

  return (
    <div className={`rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 overflow-hidden ${className}`}>
      <div className="flex items-center gap-0.5 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 px-1.5 py-1">
        {TOOLBAR_BUTTONS.map(({ command, icon: Icon, label }) => (
          <button
            key={command}
            type="button"
            title={label}
            onMouseDown={(e) => e.preventDefault()} // keep focus/selection in the editable area
            onClick={() => exec(command)}
            className="p-1.5 rounded text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-800 dark:hover:text-white"
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        style={{ minHeight }}
        className="rich-text-editable px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none prose-sm max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1"
      />
    </div>
  );
}
