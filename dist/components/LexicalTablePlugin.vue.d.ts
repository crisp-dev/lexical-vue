export interface TablePluginProps {
    /**
     * When `false` (default `true`), merged cell support (colspan and rowspan) will be disabled and all
     * tables will be forced into a regular grid with 1x1 table cells.
     */
    hasCellMerge?: boolean;
    /**
     * When `false` (default `true`), the background color of TableCellNode will always be removed.
     */
    hasCellBackgroundColor?: boolean;
    /**
     * When `true` (default `true`), the tab key can be used to navigate table cells.
     */
    hasTabHandler?: boolean;
    /**
     * When `true` (default `false`), tables will be wrapped in a `<div>` to enable horizontal scrolling
     */
    hasHorizontalScroll?: boolean;
}
declare const _default: import("vue").DefineComponent<TablePluginProps, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<TablePluginProps> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
export default _default;
