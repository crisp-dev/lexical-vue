import type { CommandListenerPriority } from 'lexical';
import type { AutoEmbedOption, EmbedConfig } from './shared';
declare const _default: <TEmbedConfig extends EmbedConfig>(__VLS_props: NonNullable<Awaited<typeof __VLS_setup>>["props"], __VLS_ctx?: __VLS_PrettifyLocal<Pick<NonNullable<Awaited<typeof __VLS_setup>>, "attrs" | "emit" | "slots">>, __VLS_expose?: NonNullable<Awaited<typeof __VLS_setup>>["expose"], __VLS_setup?: Promise<{
    props: __VLS_PrettifyLocal<Pick<Partial<{}> & Omit<{
        readonly onOpenEmbedModalForConfig?: ((embedConfig: TEmbedConfig) => any) | undefined;
    } & import("vue").VNodeProps & import("vue").AllowedComponentProps & import("vue").ComponentCustomProps, never>, "onOpenEmbedModalForConfig"> & {
        embedConfigs: Array<TEmbedConfig>;
        getMenuOptions: (activeEmbedConfig: TEmbedConfig, embedFn: () => void, dismissFn: () => void) => Array<AutoEmbedOption>;
        menuCommandPriority?: CommandListenerPriority;
    } & Partial<{}>> & import("vue").PublicProps;
    expose(exposed: import("vue").ShallowUnwrapRef<{}>): void;
    attrs: any;
    slots: {
        default?: (props: {
            listItemProps: {
                options: AutoEmbedOption[];
                selectOptionAndCleanUp: (selectedEntry: AutoEmbedOption) => void;
                selectedIndex: number | null;
                setHighlightedIndex: (index: number | null) => void;
            };
            anchorElementRef: HTMLElement;
            matchString: string;
        }) => any;
    };
    emit: (e: "openEmbedModalForConfig", embedConfig: TEmbedConfig) => void;
}>) => import("vue").VNode & {
    __ctx?: Awaited<typeof __VLS_setup>;
};
export default _default;
type __VLS_PrettifyLocal<T> = {
    [K in keyof T]: T[K];
} & {};
