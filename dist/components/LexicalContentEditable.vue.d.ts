import type { Props as ElementProps } from './LexicalContentEditableElement.vue';
import LexicalContentEditableElement from './LexicalContentEditableElement.vue';
type ContentEditableProps = Omit<ElementProps, 'editor' | 'placeholder'>;
declare const editor: import("lexical").LexicalEditor;
declare const showPlaceholder: Readonly<import("vue").Ref<boolean, boolean>>;
declare const __VLS_ctx: InstanceType<__VLS_PickNotAny<typeof __VLS_self, new () => {}>>;
declare var __VLS_4: {};
type __VLS_Slots = __VLS_PrettifyGlobal<__VLS_OmitStringIndex<typeof __VLS_ctx.$slots> & {
    placeholder?: (props: typeof __VLS_4) => any;
}>;
declare const __VLS_self: import("vue").DefineComponent<ContentEditableProps, {
    LexicalContentEditableElement: typeof LexicalContentEditableElement;
    editor: typeof editor;
    showPlaceholder: typeof showPlaceholder;
}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<ContentEditableProps> & Readonly<{}>, {
    spellcheck: boolean | "true" | "false";
    role: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_component: import("vue").DefineComponent<ContentEditableProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<ContentEditableProps> & Readonly<{}>, {
    spellcheck: boolean | "true" | "false";
    role: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: __VLS_WithSlots<typeof __VLS_component, __VLS_Slots>;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
