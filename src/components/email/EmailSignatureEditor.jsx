'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Minus,
  Undo,
  Redo,
  Palette,
  Type,
  Unlink,
  Eye,
  Code,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Preset colors for the color picker
const COLOR_PRESETS = [
  '#000000', '#374151', '#6B7280', '#9CA3AF',
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899',
  '#0EA5E9', '#14B8A6', '#84CC16', '#F43F5E',
];

// Font size options
const FONT_SIZES = [
  { label: 'Small', value: '12px' },
  { label: 'Normal', value: '14px' },
  { label: 'Medium', value: '16px' },
  { label: 'Large', value: '18px' },
  { label: 'XL', value: '22px' },
];

function ToolbarButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <div className="w-px h-6 bg-border mx-1" />;
}

export default function EmailSignatureEditor({ value, onChange, disabled }) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imageWidth, setImageWidth] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          style: 'color: #3B82F6; text-decoration: underline;',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          style: 'max-width: 100%; height: auto;',
        },
      }),
      TextAlign.configure({
        types: ['paragraph'],
      }),
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder: 'Design your email signature here...\n\nExample:\nJohn Smith\nSales Manager | My Company\n+1 (555) 123-4567\nwww.mycompany.com',
      }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Don't emit empty paragraph as content
      if (html === '<p></p>') {
        onChange?.('');
      } else {
        onChange?.(html);
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[160px] px-4 py-3 text-sm',
      },
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== undefined) {
      const currentContent = editor.getHTML();
      if (currentContent !== value && !(currentContent === '<p></p>' && !value)) {
        editor.commands.setContent(value || '');
      }
    }
  }, [value, editor]);

  // Link dialog handlers
  const handleAddLink = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, '');
    setLinkText(selectedText);

    const existingLink = editor.getAttributes('link').href;
    setLinkUrl(existingLink || 'https://');
    setShowLinkDialog(true);
  }, [editor]);

  const handleConfirmLink = useCallback(() => {
    if (!editor || !linkUrl) return;

    let url = linkUrl.trim();
    if (url && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
      url = 'https://' + url;
    }

    if (linkText && !editor.state.selection.content().size) {
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${url}" style="color: #3B82F6; text-decoration: underline;" target="_blank" rel="noopener noreferrer">${linkText}</a>`)
        .run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }

    setShowLinkDialog(false);
    setLinkUrl('');
    setLinkText('');
  }, [editor, linkUrl, linkText]);

  // Image dialog handlers
  const handleAddImage = useCallback(() => {
    setImageUrl('');
    setImageAlt('Company Logo');
    setImageWidth('200');
    setShowImageDialog(true);
  }, []);

  const handleConfirmImage = useCallback(() => {
    if (!editor || !imageUrl) return;

    const style = imageWidth
      ? `max-width: ${imageWidth}px; height: auto;`
      : 'max-width: 100%; height: auto;';

    editor
      .chain()
      .focus()
      .setImage({
        src: imageUrl.trim(),
        alt: imageAlt || 'Logo',
        title: imageAlt || '',
      })
      .run();

    // Apply width via style attribute after insertion
    setTimeout(() => {
      const imgs = editor.view.dom.querySelectorAll('img');
      const lastImg = imgs[imgs.length - 1];
      if (lastImg && lastImg.src === imageUrl.trim()) {
        lastImg.style.cssText = style;
      }
    }, 50);

    setShowImageDialog(false);
    setImageUrl('');
    setImageAlt('');
    setImageWidth('');
  }, [editor, imageUrl, imageAlt, imageWidth]);

  // Color handler
  const handleSetColor = useCallback((color) => {
    if (!editor) return;
    editor.chain().focus().setColor(color).run();
    setShowColorPicker(false);
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="space-y-3">
      {/* Editor Container */}
      <div className={cn(
        'rounded-lg border border-border overflow-hidden bg-background',
        disabled && 'opacity-60 pointer-events-none'
      )}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30">
          {/* Text Formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive('underline')}
            title="Underline"
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarSeparator />

          {/* Color */}
          <div className="relative">
            <ToolbarButton
              onClick={() => setShowColorPicker(!showColorPicker)}
              title="Text Color"
            >
              <Palette className="h-4 w-4" />
            </ToolbarButton>
            {showColorPicker && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 grid grid-cols-4 gap-1.5 w-[140px]">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleSetColor(color)}
                    className="w-7 h-7 rounded-md border border-border hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Font Size */}
          <select
            onChange={(e) => {
              if (!e.target.value) return;
              editor.chain().focus().setMark('textStyle', { fontSize: e.target.value }).run();
            }}
            className="h-7 px-1.5 text-xs bg-transparent border border-border rounded-md text-foreground cursor-pointer"
            title="Font Size"
            defaultValue=""
          >
            <option value="" disabled>Size</option>
            {FONT_SIZES.map((size) => (
              <option key={size.value} value={size.value}>{size.label}</option>
            ))}
          </select>

          <ToolbarSeparator />

          {/* Alignment */}
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            active={editor.isActive({ textAlign: 'left' })}
            title="Align Left"
          >
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            active={editor.isActive({ textAlign: 'center' })}
            title="Align Center"
          >
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            active={editor.isActive({ textAlign: 'right' })}
            title="Align Right"
          >
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarSeparator />

          {/* Lists */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Bullet List"
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Numbered List"
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>

          {/* Divider Line */}
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal Line"
          >
            <Minus className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarSeparator />

          {/* Link */}
          <ToolbarButton
            onClick={handleAddLink}
            active={editor.isActive('link')}
            title="Add Link"
          >
            <LinkIcon className="h-4 w-4" />
          </ToolbarButton>
          {editor.isActive('link') && (
            <ToolbarButton
              onClick={() => editor.chain().focus().unsetLink().run()}
              title="Remove Link"
            >
              <Unlink className="h-4 w-4" />
            </ToolbarButton>
          )}

          {/* Image */}
          <ToolbarButton
            onClick={handleAddImage}
            title="Add Image / Logo"
          >
            <ImageIcon className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarSeparator />

          {/* Undo / Redo */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <Undo className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <Redo className="h-4 w-4" />
          </ToolbarButton>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Preview / Source toggles */}
          <ToolbarButton
            onClick={() => { setShowPreview(!showPreview); setShowSource(false); }}
            active={showPreview}
            title="Preview"
          >
            <Eye className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => { setShowSource(!showSource); setShowPreview(false); }}
            active={showSource}
            title="HTML Source"
          >
            <Code className="h-4 w-4" />
          </ToolbarButton>
        </div>

        {/* Editor / Preview / Source */}
        {showPreview ? (
          <div className="px-4 py-3 min-h-[160px] bg-white dark:bg-gray-950">
            <div className="text-xs text-muted-foreground mb-2 font-medium">Email Preview</div>
            <div
              className="border-t-2 border-border pt-3 mt-1"
              style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '14px', lineHeight: '1.5', color: '#333' }}
            >
              <div dangerouslySetInnerHTML={{ __html: value || '<em style="color:#9CA3AF">No signature set</em>' }} />
            </div>
          </div>
        ) : showSource ? (
          <textarea
            value={value || ''}
            onChange={(e) => {
              onChange?.(e.target.value);
              editor.commands.setContent(e.target.value);
            }}
            className="w-full px-4 py-3 min-h-[160px] text-xs font-mono bg-gray-50 dark:bg-gray-950 text-foreground focus:outline-none resize-y"
            spellCheck={false}
          />
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>

      {/* Click-outside handler for color picker */}
      {showColorPicker && (
        <div className="fixed inset-0 z-40" onClick={() => setShowColorPicker(false)} />
      )}

      {/* ---- Link Dialog ---- */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="link-text">Link Text</Label>
              <Input
                id="link-text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="e.g. Visit our website"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://www.example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>Cancel</Button>
            <Button onClick={handleConfirmLink} disabled={!linkUrl.trim()}>Add Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Image Dialog ---- */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Image / Logo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="image-url">Image URL</Label>
              <Input
                id="image-url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://www.example.com/logo.png"
              />
              <p className="text-xs text-muted-foreground">
                Use a publicly accessible URL. For best results, use PNG or JPG format.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="image-alt">Alt Text</Label>
              <Input
                id="image-alt"
                value={imageAlt}
                onChange={(e) => setImageAlt(e.target.value)}
                placeholder="Company Logo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image-width">Width (px)</Label>
              <Input
                id="image-width"
                type="number"
                value={imageWidth}
                onChange={(e) => setImageWidth(e.target.value)}
                placeholder="200"
                min="20"
                max="600"
              />
              <p className="text-xs text-muted-foreground">
                Recommended: 100-300px for logos. Leave empty for original size.
              </p>
            </div>
            {imageUrl && (
              <div className="border rounded-lg p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                <img
                  src={imageUrl}
                  alt={imageAlt || 'Preview'}
                  style={{ maxWidth: imageWidth ? `${imageWidth}px` : '100%', height: 'auto' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImageDialog(false)}>Cancel</Button>
            <Button onClick={handleConfirmImage} disabled={!imageUrl.trim()}>Add Image</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
