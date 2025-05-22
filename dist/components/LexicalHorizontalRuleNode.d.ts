import type { DOMConversionMap, DOMExportOutput, EditorConfig, LexicalCommand, LexicalNode, SerializedLexicalNode } from 'lexical';
import { DecoratorNode } from 'lexical';
import type { Component } from 'vue';
export type SerializedHorizontalRuleNode = SerializedLexicalNode;
export declare const INSERT_HORIZONTAL_RULE_COMMAND: LexicalCommand<void>;
export declare class HorizontalRuleNode extends DecoratorNode<Component> {
    static getType(): string;
    static clone(node: HorizontalRuleNode): HorizontalRuleNode;
    static importJSON(serializedNode: SerializedHorizontalRuleNode): HorizontalRuleNode;
    static importDOM(): DOMConversionMap | null;
    exportDOM(): DOMExportOutput;
    createDOM(config: EditorConfig): HTMLElement;
    getTextContent(): string;
    isInline(): false;
    updateDOM(): boolean;
    decorate(): Component;
}
export declare function $createHorizontalRuleNode(): HorizontalRuleNode;
export declare function $isHorizontalRuleNode(node: LexicalNode | null | undefined): node is HorizontalRuleNode;
