import type { ElementFormatType, NodeKey } from 'lexical';
type __VLS_Props = {
    format?: ElementFormatType;
    nodeKey: NodeKey;
    baseClass?: string;
    focusClass?: string;
};
declare const isSelected: Readonly<import("vue").Ref<boolean, boolean>>;
declare const containerRef: import("vue").Ref<HTMLDivElement | null, HTMLDivElement | null>;
declare const __VLS_ctx: InstanceType<__VLS_PickNotAny<typeof __VLS_self, new () => {}>>;
declare var __VLS_1: {};
type __VLS_Slots = __VLS_PrettifyGlobal<__VLS_OmitStringIndex<typeof __VLS_ctx.$slots> & {
    default?: (props: typeof __VLS_1) => any;
}>;
declare const __VLS_self: import("vue").DefineComponent<__VLS_Props, {
    isSelected: typeof isSelected;
    containerRef: typeof containerRef;
}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const __VLS_component: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: __VLS_WithSlots<typeof __VLS_component, __VLS_Slots>;
export default _default;
type __VLS_WithSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
