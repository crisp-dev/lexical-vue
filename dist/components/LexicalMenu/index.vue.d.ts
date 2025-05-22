import type { CommandListenerPriority, LexicalEditor, TextNode } from 'lexical';
import { type MenuOption, type MenuResolution } from './shared';
declare const _default: <TOption extends MenuOption>(__VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"], __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>, __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"], __VLS_setup?: Promise<{
    props: __VLS_PrettifyLocal<Pick<Partial<{}> & Omit<{
        readonly onSelectOption?: ((payload: {
            option: TOption;
            textNodeContainingQuery: TextNode | null;
            closeMenu: () => void;
            matchingString: string;
        }) => any) | undefined;
    } & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps, never>, "onSelectOption"> & {
        close: () => void;
        editor: LexicalEditor;
        anchorElementRef: HTMLElement;
        resolution: MenuResolution;
        options: Array<TOption>;
        shouldSplitNodeWithQuery?: boolean;
        commandPriority?: CommandListenerPriority;
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
    emit: (e: "selectOption", payload: {
        option: TOption;
        textNodeContainingQuery: TextNode | null;
        closeMenu: () => void;
        matchingString: string;
    }) => void;
}>) => import("vue").VNode & {
    __ctx?: Awaited<typeof __VLS_setup>;
};
export default _default;
type __VLS_PrettifyLocal<T> = {
    [K in keyof T]: T[K];
} & {};
