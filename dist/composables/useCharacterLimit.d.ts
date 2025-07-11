import type { LexicalEditor } from 'lexical';
import { OverflowNode } from '@lexical/overflow';
import { type MaybeRefOrGetter } from 'vue';
interface OptionalProps {
    remainingCharacters?: (characters: number) => void;
    strlen?: (input: string) => number;
}
export declare function useCharacterLimit(editor: LexicalEditor, maxCharacters: MaybeRefOrGetter<number>, optional?: MaybeRefOrGetter<OptionalProps>): void;
export declare function mergePrevious(overflowNode: OverflowNode): void;
export {};
