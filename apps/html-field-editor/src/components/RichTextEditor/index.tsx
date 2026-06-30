import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RawHtmlBlock } from './RawHtmlBlock';
import { postprocessHtml, preprocessHtml } from './htmlPreprocess';
import Toolbar from './Toolbar';
import './editor.css';

interface Props {
  initialHtml: string;
  onChange: (html: string) => void;
}

export default function RichTextEditor({ initialHtml, onChange }: Props) {
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  // htmlSource always holds the clean, human-readable HTML (no internal markers)
  const [htmlSource, setHtmlSource] = useState(initialHtml);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const latestHtmlRef = useRef(initialHtml);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const notify = useCallback(
    (html: string) => {
      latestHtmlRef.current = html;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChangeRef.current(html), 400);
    },
    [],
  );

  // Only allow visual-editor saves after the user has explicitly focused it.
  // This prevents any internal TipTap transaction from overwriting content
  // that the user typed in HTML source mode before touching the visual editor.
  const hasBeenFocusedRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Subscript,
      Superscript,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      RawHtmlBlock,
    ],
    // Wrap unknown top-level elements before TipTap parses them
    content: preprocessHtml(initialHtml || ''),
    onFocus() {
      hasBeenFocusedRef.current = true;
    },
    onUpdate({ editor }) {
      if (!hasBeenFocusedRef.current) return;
      // Strip internal markers back to clean HTML before exposing outward
      const clean = postprocessHtml(editor.getHTML());
      setHtmlSource(clean);
      notify(clean);
    },
  });

  // Flush any pending debounced save before unmounting so content is never
  // lost when the iframe is torn down (e.g. after Contentful publish).
  useEffect(() => {
    return () => {
      if (debounceRef.current !== undefined) {
        clearTimeout(debounceRef.current);
        onChangeRef.current(latestHtmlRef.current);
      }
    };
  }, []);

  const toggleMode = () => {
    if (isHtmlMode) {
      // Returning to visual — re-wrap any unknown elements before setContent.
      // { emitUpdate: false } prevents onUpdate from firing and overwriting
      // htmlSource with TipTap's processed output.
      editor?.commands.setContent(preprocessHtml(htmlSource), { emitUpdate: false });
    }
    setIsHtmlMode(m => !m);
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setHtmlSource(value);
    // Save immediately (no debounce) so Contentful recognises the change
    // before the user clicks Publish.
    latestHtmlRef.current = value;
    clearTimeout(debounceRef.current);
    debounceRef.current = undefined;
    onChangeRef.current(value);
  };

  return (
    <div className="rte-wrapper">
      <Toolbar
        editor={editor}
        isHtmlMode={isHtmlMode}
        onToggleHtml={toggleMode}
      />
      {isHtmlMode ? (
        <textarea
          className="rte-source"
          value={htmlSource}
          onChange={handleSourceChange}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
      ) : (
        <EditorContent editor={editor} className="rte-content" />
      )}
    </div>
  );
}
