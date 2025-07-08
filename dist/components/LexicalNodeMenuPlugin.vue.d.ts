import type { CommandListenerPriority, NodeKey, TextNode } from 'lexical';
import type { MenuOption, MenuResolution } from './LexicalMenu/shared';
declare const _default: <TOption extends MenuOption>(__VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"], __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>, __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"], __VLS_setup?: Promise<{
    props: __VLS_PrettifyLocal<Pick<Partial<{}> & Omit<{
        readonly onClose?: (() => any) | undefined;
        readonly onSelectOption?: ((payload: {
            option: TOption;
            textNodeContainingQuery: TextNode | null;
            closeMenu: () => void;
            matchingString: string;
        }) => any) | undefined;
        readonly onOpen?: ((payload: MenuResolution) => any) | undefined;
    } & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps, never>, "onClose" | "onSelectOption" | "onOpen"> & {
        options: Array<TOption>;
        nodeKey: NodeKey | null;
        anchorClassName?: string;
        commandPriority?: CommandListenerPriority;
        parent?: HTMLElement;
    } & Partial<{}>> & import("vue").PublicProps;
    expose(exposed: import("vue").ShallowUnwrapRef<{}>): void;
    attrs: any;
    slots: {
        default?: (props: {
            listItemProps: {
                options: TOption[];
                selectOptionAndCleanUp: (selectedEntry: TOption) => void;
                selectedIndex: number | null;
                setHighlightedIndex: (index: number | null) => void;
            };
            anchorElementRef: HTMLElement;
            matchString: string;
        }) => any;
    };
    emit: {
        (e: "close"): void;
        (e: "open", payload: MenuResolution): void;
        (e: "selectOption", payload: {
            option: TOption;
            textNodeContainingQuery: TextNode | null;
            closeMenu: () => void;
            matchingString: string;
        }): void;
    };
}>) => import("vue").VNode<import("vue").RendererNode, import("vue").RendererElement, {
    [key: string]: any;
}> & {
    __ctx?: Awaited<typeof __VLS_setup>;
};
export default _default;
type __VLS_PrettifyLocal<T> = {
    [K in keyof T]: T[K];
} & {};
