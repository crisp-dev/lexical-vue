import { type HeadingTagType } from '@lexical/rich-text';
import { type LexicalEditor, type NodeKey } from 'lexical';
export type TableOfContentsEntry = [
    key: NodeKey,
    text: string,
    tag: HeadingTagType
];
export declare function useTableOfContents(editor: LexicalEditor): import("vue").Ref<[key: string, text: string, tag: HeadingTagType][], TableOfContentsEntry[] | [key: string, text: string, tag: HeadingTagType][]>;
