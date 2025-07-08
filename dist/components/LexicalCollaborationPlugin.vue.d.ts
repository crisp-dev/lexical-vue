import type { Doc } from 'yjs';
import type { ExcludedProperties, Provider } from '@lexical/yjs';
import type { InitialEditorStateType } from '../types';
type __VLS_Props = {
    id: string;
    providerFactory: (id: string, yjsDocMap: Map<string, Doc>) => Provider;
    shouldBootstrap: boolean;
    username?: string;
    cursorColor?: string;
    cursorsContainerRef?: HTMLElement | null;
    initialEditorState?: InitialEditorStateType;
    excludedProperties?: ExcludedProperties;
    awarenessData?: object;
};
declare const _default: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
export default _default;
