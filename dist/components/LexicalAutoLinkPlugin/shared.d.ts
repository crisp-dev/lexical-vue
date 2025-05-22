import type { LinkAttributes } from '@lexical/link';
import type { LexicalEditor } from 'lexical';
import type { MaybeRefOrGetter } from 'vue';
type ChangeHandler = (url: string | null, prevUrl: string | null) => void;
interface LinkMatcherResult {
    attributes?: LinkAttributes;
    index: number;
    length: number;
    text: string;
    url: string;
}
export type LinkMatcher = (text: string) => LinkMatcherResult | null;
export declare function useAutoLink(editor: LexicalEditor, matchers: MaybeRefOrGetter<Array<LinkMatcher>>, onChange?: ChangeHandler): void;
export declare function createLinkMatcherWithRegExp(regExp: RegExp, urlTransformer?: (text: string) => string): (text: string) => {
    index: number;
    length: number;
    text: string;
    url: string;
} | null;
export {};
