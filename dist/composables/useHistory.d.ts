import type { HistoryState } from '@lexical/history';
import type { LexicalEditor } from 'lexical';
import { type MaybeRefOrGetter } from 'vue';
export declare function useHistory(editor: MaybeRefOrGetter<LexicalEditor>, externalHistoryState?: MaybeRefOrGetter<HistoryState | undefined>, delay?: MaybeRefOrGetter<number | undefined>): void;
