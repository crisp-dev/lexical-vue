import type { LexicalEditor } from 'lexical';
import type { AriaAttributes } from 'vue';
import type { HTMLAttributes } from '../types';
export type Props = {
    editor: LexicalEditor;
    ariaActiveDescendant?: AriaAttributes['aria-activedescendant'];
    ariaAutoComplete?: AriaAttributes['aria-autocomplete'];
    ariaControls?: AriaAttributes['aria-controls'];
    ariaDescribedBy?: AriaAttributes['aria-describedby'];
    ariaErrorMessage?: AriaAttributes['aria-errormessage'];
    ariaExpanded?: AriaAttributes['aria-expanded'];
    ariaInvalid?: AriaAttributes['aria-invalid'];
    ariaLabel?: AriaAttributes['aria-label'];
    ariaLabelledBy?: AriaAttributes['aria-labelledby'];
    ariaMultiline?: AriaAttributes['aria-multiline'];
    ariaOwns?: AriaAttributes['aria-owns'];
    ariaRequired?: AriaAttributes['aria-required'];
    dataTestid?: string;
} & Omit<HTMLAttributes, 'placeholder'>;
declare const _default: import("vue").DefineComponent<Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<Props> & Readonly<{}>, {
    spellcheck: boolean | "true" | "false";
    role: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
export default _default;
