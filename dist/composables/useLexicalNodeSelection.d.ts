import type { NodeKey } from 'lexical';
import { type MaybeRefOrGetter } from 'vue';
export declare function useLexicalNodeSelection(key: MaybeRefOrGetter<NodeKey>): {
    isSelected: Readonly<import("vue").Ref<boolean, boolean>>;
    setSelected: (selected: boolean) => void;
    clearSelection: () => void;
};
