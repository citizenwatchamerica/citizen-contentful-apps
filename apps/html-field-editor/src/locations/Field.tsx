import { FieldAppSDK } from '@contentful/app-sdk';
import { useSDK } from '@contentful/react-apps-toolkit';
import { useCallback, useEffect, useMemo } from 'react';
import RichTextEditor from '../components/RichTextEditor';

const Field = () => {
  const sdk = useSDK<FieldAppSDK>();

  useEffect(() => {
    sdk.window.startAutoResizer();
  }, [sdk.window]);

  // Read the stored HTML string directly from the field.
  const initialHtml = useMemo(() => {
    const value = sdk.field.getValue();
    if (typeof value === 'string') return value;
    return '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once

  const handleChange = useCallback(
    async (html: string) => {
      if (!html || html === '<p></p>') {
        await sdk.field.removeValue();
        return;
      }
      await sdk.field.setValue(html);
    },
    [sdk.field],
  );

  // This app stores HTML as a plain string — it requires a Long Text (Text)
  // field type. Rich Text fields use a structured Document format that cannot
  // represent arbitrary HTML without losing classes, div wrappers, etc.
  const fieldType = (sdk.field as { type: string }).type;
  if (fieldType !== 'Text' && fieldType !== 'Symbol') {
    return (
      <div style={{
        padding: '12px 16px',
        border: '1px solid #d83b3b',
        borderRadius: '4px',
        color: '#d83b3b',
        fontFamily: 'monospace',
        fontSize: '13px',
        lineHeight: '1.6',
      }}>
        <strong>Wrong field type: {fieldType}</strong><br />
        This app requires a <strong>Long Text</strong> field (type&nbsp;<code>Text</code>).<br />
        Go to <em>Content model → your content type → this field</em>,
        change the type to <strong>Long Text</strong>, then save the content type and reload this page.
      </div>
    );
  }

  return (
    <RichTextEditor initialHtml={initialHtml} onChange={handleChange} />
  );
};

export default Field;
