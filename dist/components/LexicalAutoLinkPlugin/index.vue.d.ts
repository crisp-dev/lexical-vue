import { type LinkMatcher } from './shared';
type __VLS_Props = {
    matchers: LinkMatcher[];
};
declare const _default: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {} & {
    change: (value: {
        url: string | null;
        prevUrl: string | null;
    }) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onChange?: ((value: {
        url: string | null;
        prevUrl: string | null;
    }) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
export default _default;
