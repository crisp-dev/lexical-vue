import type { Props as ElementProps } from './LexicalContentEditableElement.vue';
type ContentEditableProps = Omit<ElementProps, 'editor' | 'placeholder'>;
declare var __VLS_4: {};
type __VLS_Slots = {} & {
    placeholder?: (props: typeof __VLS_4) => any;
};
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
