import type { EditorState, LexicalEditor } from 'lexical';
type __VLS_Props = {
    ignoreInitialChange?: boolean;
    ignoreSelectionChange?: boolean;
    ignoreHistoryMergeTagChange?: boolean;
};
declare const _default: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {} & {
    change: (editorState: EditorState, editor: LexicalEditor, tags: Set<string>) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onChange?: ((editorState: EditorState, editor: LexicalEditor, tags: Set<string>) => any) | undefined;
}>, {
    ignoreInitialChange: boolean;
    ignoreSelectionChange: boolean;
    ignoreHistoryMergeTagChange: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
export default _default;
