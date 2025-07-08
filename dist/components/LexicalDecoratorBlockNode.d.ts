import type { ElementFormatType, LexicalNode, LexicalUpdateJSON, NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import { DecoratorNode } from 'lexical';
import type { Component } from 'vue';
export type SerializedDecoratorBlockNode = Spread<{
    format: ElementFormatType;
}, SerializedLexicalNode>;
export declare class DecoratorBlockNode extends DecoratorNode<Component> {
    __format: ElementFormatType;
    constructor(format?: ElementFormatType, key?: NodeKey);
    canIndent(): false;
    isInline(): false;
    exportJSON(): SerializedDecoratorBlockNode;
    updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedDecoratorBlockNode>): this;
    setFormat(format: ElementFormatType): this;
    createDOM(): HTMLDivElement;
    updateDOM(): boolean;
}
export declare function $createDecoratorBlockNode(): DecoratorBlockNode;
export declare function $isDecoratorBlockNode(node: LexicalNode | null | undefined): node is DecoratorBlockNode;
