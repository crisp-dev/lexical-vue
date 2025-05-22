// src/composables/useCanShowPlaceholder.ts
import { readonly, ref } from "vue";
import { $canShowPlaceholderCurry } from "@lexical/text";
import { mergeRegister } from "@lexical/utils";

// src/composables/useMounted.ts
import { onMounted, onUnmounted } from "vue";
function useMounted(cb) {
  let unregister;
  onMounted(() => {
    unregister = cb();
  });
  onUnmounted(() => {
    unregister?.();
  });
}

// src/composables/useCanShowPlaceholder.ts
function canShowPlaceholderFromCurrentEditorState(editor) {
  const currentCanShowPlaceholder = editor.getEditorState().read($canShowPlaceholderCurry(editor.isComposing()));
  return currentCanShowPlaceholder;
}
function useCanShowPlaceholder(editor) {
  const initialState = editor.getEditorState().read($canShowPlaceholderCurry(editor.isComposing()));
  const canShowPlaceholder = ref(initialState);
  function resetCanShowPlaceholder() {
    const currentCanShowPlaceholder = canShowPlaceholderFromCurrentEditorState(editor);
    canShowPlaceholder.value = currentCanShowPlaceholder;
  }
  useMounted(() => {
    return mergeRegister(
      editor.registerUpdateListener(() => {
        resetCanShowPlaceholder();
      }),
      editor.registerEditableListener(() => {
        resetCanShowPlaceholder();
      })
    );
  });
  return readonly(canShowPlaceholder);
}

// src/composables/useCharacterLimit.ts
import {
  $createOverflowNode,
  $isOverflowNode,
  OverflowNode
} from "@lexical/overflow";
import { $rootTextContent } from "@lexical/text";
import { $dfs, mergeRegister as mergeRegister2 } from "@lexical/utils";
import {
  $getSelection,
  $isLeafNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection
} from "lexical";
import invariant from "tiny-invariant";
import { toValue, watchEffect } from "vue";
function useCharacterLimit(editor, maxCharacters, optional = Object.freeze({})) {
  watchEffect((onInvalidate) => {
    if (!editor.hasNodes([OverflowNode])) {
      invariant(
        false,
        "useCharacterLimit: OverflowNode not registered on editor"
      );
    }
    const {
      strlen = (input) => input.length,
      // UTF-16
      remainingCharacters = (_characters) => {
      }
    } = toValue(optional);
    let text = editor.getEditorState().read($rootTextContent);
    let lastComputedTextLength = 0;
    const fn = mergeRegister2(
      editor.registerTextContentListener((currentText) => {
        text = currentText;
      }),
      editor.registerUpdateListener(({ dirtyLeaves }) => {
        const isComposing = editor.isComposing();
        const hasDirtyLeaves = dirtyLeaves.size > 0;
        if (isComposing || !hasDirtyLeaves)
          return;
        const textLength = strlen(text);
        const textLengthAboveThreshold = textLength > toValue(maxCharacters) || lastComputedTextLength !== null && lastComputedTextLength > toValue(maxCharacters);
        const diff = toValue(maxCharacters) - textLength;
        remainingCharacters(diff);
        if (lastComputedTextLength === null || textLengthAboveThreshold) {
          const offset = findOffset(text, toValue(maxCharacters), strlen);
          editor.update(
            () => {
              $wrapOverflowedNodes(offset);
            },
            {
              tag: "history-merge"
            }
          );
        }
        lastComputedTextLength = textLength;
      })
    );
    onInvalidate(() => {
      fn();
    });
  });
}
function findOffset(text, maxCharacters, strlen) {
  const Segmenter = Intl.Segmenter;
  let offsetUtf16 = 0;
  let offset = 0;
  if (typeof Segmenter === "function") {
    const segmenter = new Segmenter();
    const graphemes = segmenter.segment(text);
    for (const { segment: grapheme } of graphemes) {
      const nextOffset = offset + strlen(grapheme);
      if (nextOffset > maxCharacters)
        break;
      offset = nextOffset;
      offsetUtf16 += grapheme.length;
    }
  } else {
    const codepoints = Array.from(text);
    const codepointsLength = codepoints.length;
    for (let i = 0; i < codepointsLength; i++) {
      const codepoint = codepoints[i];
      const nextOffset = offset + strlen(codepoint);
      if (nextOffset > maxCharacters)
        break;
      offset = nextOffset;
      offsetUtf16 += codepoint.length;
    }
  }
  return offsetUtf16;
}
function $wrapOverflowedNodes(offset) {
  const dfsNodes = $dfs();
  const dfsNodesLength = dfsNodes.length;
  let accumulatedLength = 0;
  for (let i = 0; i < dfsNodesLength; i += 1) {
    const { node } = dfsNodes[i];
    if ($isOverflowNode(node)) {
      const previousLength = accumulatedLength;
      const nextLength = accumulatedLength + node.getTextContentSize();
      if (nextLength <= offset) {
        const parent = node.getParent();
        const previousSibling = node.getPreviousSibling();
        const nextSibling = node.getNextSibling();
        $unwrapNode(node);
        const selection = $getSelection();
        if ($isRangeSelection(selection) && (!selection.anchor.getNode().isAttached() || !selection.focus.getNode().isAttached())) {
          if ($isTextNode(previousSibling))
            previousSibling.select();
          else if ($isTextNode(nextSibling))
            nextSibling.select();
          else if (parent !== null)
            parent.select();
        }
      } else if (previousLength < offset) {
        const descendant = node.getFirstDescendant();
        const descendantLength = descendant !== null ? descendant.getTextContentSize() : 0;
        const previousPlusDescendantLength = previousLength + descendantLength;
        const firstDescendantIsSimpleText = $isTextNode(descendant) && descendant.isSimpleText();
        const firstDescendantDoesNotOverflow = previousPlusDescendantLength <= offset;
        if (firstDescendantIsSimpleText || firstDescendantDoesNotOverflow)
          $unwrapNode(node);
      }
    } else if ($isLeafNode(node)) {
      const previousAccumulatedLength = accumulatedLength;
      accumulatedLength += node.getTextContentSize();
      if (accumulatedLength > offset && !$isOverflowNode(node.getParent())) {
        const previousSelection = $getSelection();
        let overflowNode;
        if (previousAccumulatedLength < offset && $isTextNode(node) && node.isSimpleText()) {
          const [, overflowedText] = node.splitText(
            offset - previousAccumulatedLength
          );
          overflowNode = $wrapNode(overflowedText);
        } else {
          overflowNode = $wrapNode(node);
        }
        if (previousSelection !== null)
          $setSelection(previousSelection);
        mergePrevious(overflowNode);
      }
    }
  }
}
function $wrapNode(node) {
  const overflowNode = $createOverflowNode();
  node.insertBefore(overflowNode);
  overflowNode.append(node);
  return overflowNode;
}
function $unwrapNode(node) {
  const children = node.getChildren();
  const childrenLength = children.length;
  for (let i = 0; i < childrenLength; i++)
    node.insertBefore(children[i]);
  node.remove();
  return childrenLength > 0 ? children[childrenLength - 1] : null;
}
function mergePrevious(overflowNode) {
  const previousNode = overflowNode.getPreviousSibling();
  if (!$isOverflowNode(previousNode))
    return;
  const firstChild = overflowNode.getFirstChild();
  const previousNodeChildren = previousNode.getChildren();
  const previousNodeChildrenLength = previousNodeChildren.length;
  if (firstChild === null) {
    overflowNode.append(...previousNodeChildren);
  } else {
    for (let i = 0; i < previousNodeChildrenLength; i++)
      firstChild.insertBefore(previousNodeChildren[i]);
  }
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    const anchor = selection.anchor;
    const anchorNode = anchor.getNode();
    const focus = selection.focus;
    const focusNode = anchor.getNode();
    if (anchorNode.is(previousNode)) {
      anchor.set(overflowNode.getKey(), anchor.offset, "element");
    } else if (anchorNode.is(overflowNode)) {
      anchor.set(
        overflowNode.getKey(),
        previousNodeChildrenLength + anchor.offset,
        "element"
      );
    }
    if (focusNode.is(previousNode)) {
      focus.set(overflowNode.getKey(), focus.offset, "element");
    } else if (focusNode.is(overflowNode)) {
      focus.set(
        overflowNode.getKey(),
        previousNodeChildrenLength + focus.offset,
        "element"
      );
    }
  }
  previousNode.remove();
}

// src/composables/useDecorators.ts
import { Teleport, computed, h, shallowRef, unref } from "vue";
function useDecorators(editor) {
  const decorators = shallowRef(editor.getDecorators());
  useMounted(() => {
    return editor.registerDecoratorListener((nextDecorators) => {
      decorators.value = nextDecorators;
    });
  });
  return computed(() => {
    const decoratedTeleports = [];
    const decoratorKeys = Object.keys(unref(decorators));
    for (let i = 0; i < decoratorKeys.length; i++) {
      const nodeKey = decoratorKeys[i];
      const vueDecorator = decorators.value[nodeKey];
      const element = editor.getElementByKey(nodeKey);
      if (element !== null) {
        decoratedTeleports.push(
          h(Teleport, {
            to: element
          }, vueDecorator)
        );
      }
    }
    return decoratedTeleports;
  });
}

// src/composables/useEffect.ts
import { watchEffect as watchEffect2 } from "vue";
function useEffect(cb, options) {
  watchEffect2((onInvalidate) => {
    const unregister = cb();
    onInvalidate(() => unregister?.());
  }, {
    ...options
  });
}

// src/composables/useHistory.ts
import { computed as computed2, toValue as toValue2, watchEffect as watchEffect3 } from "vue";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
function useHistory(editor, externalHistoryState, delay) {
  const historyState = computed2(
    () => toValue2(externalHistoryState) || createEmptyHistoryState()
  );
  watchEffect3((onInvalidate) => {
    const unregisterListener = registerHistory(toValue2(editor), historyState.value, toValue2(delay) || 1e3);
    onInvalidate(unregisterListener);
  });
}

// src/composables/useLexicalCommandsLog.ts
import { COMMAND_PRIORITY_HIGH } from "lexical";
import { readonly as readonly2, ref as ref2 } from "vue";
function useLexicalCommandsLog(editor) {
  const loggedCommands = ref2([]);
  useMounted(() => {
    const unregisterCommandListeners = /* @__PURE__ */ new Set();
    for (const [command] of editor._commands) {
      unregisterCommandListeners.add(
        editor.registerCommand(
          command,
          (payload) => {
            loggedCommands.value = [
              ...loggedCommands.value,
              {
                payload,
                type: command.type ? command.type : "UNKNOWN"
              }
            ];
            if (loggedCommands.value.length > 10)
              loggedCommands.value.shift();
            return false;
          },
          COMMAND_PRIORITY_HIGH
        )
      );
    }
    return () => {
      unregisterCommandListeners.forEach((unregister) => unregister());
    };
  });
  return readonly2(loggedCommands);
}

// src/composables/useLexicalComposer.ts
import { inject } from "vue";
import invariant2 from "tiny-invariant";

// src/composables/inject.ts
var LexicalEditorProviderKey = "LexicalEditorProviderKey";

// src/composables/useLexicalComposer.ts
function useLexicalComposer() {
  const editor = inject(LexicalEditorProviderKey);
  if (!editor) {
    invariant2(
      false,
      "useLexicalComposer: cannot find a LexicalComposer"
    );
  }
  return editor;
}

// src/composables/useLexicalIsTextContentEmpty.ts
import { readonly as readonly3, ref as ref3 } from "vue";
import { $isRootTextContentEmptyCurry } from "@lexical/text";
function useLexicalIsTextContentEmpty(editor, trim) {
  const isEmpty = ref3(
    editor.getEditorState().read($isRootTextContentEmptyCurry(editor.isComposing(), trim))
  );
  useMounted(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      const isComposing = editor.isComposing();
      isEmpty.value = editorState.read(
        $isRootTextContentEmptyCurry(isComposing, trim)
      );
    });
  });
  return readonly3(isEmpty);
}

// src/composables/useLexicalNodeSelection.ts
import {
  $createNodeSelection,
  $getNodeByKey,
  $getSelection as $getSelection2,
  $isNodeSelection,
  $setSelection as $setSelection2
} from "lexical";
import { readonly as readonly4, ref as ref4, toValue as toValue3, watchEffect as watchEffect4 } from "vue";
function isNodeSelected(editor, key) {
  return editor.getEditorState().read(() => {
    const node = $getNodeByKey(key);
    if (node === null)
      return false;
    return node.isSelected();
  });
}
function useLexicalNodeSelection(key) {
  const editor = useLexicalComposer();
  const isSelected = ref4(isNodeSelected(editor, toValue3(key)));
  watchEffect4((onInvalidate) => {
    const unregisterListener = editor.registerUpdateListener(() => {
      isSelected.value = isNodeSelected(editor, toValue3(key));
    });
    onInvalidate(() => {
      unregisterListener();
    });
  });
  const setSelected = (selected) => {
    editor.update(() => {
      let selection = $getSelection2();
      if (!$isNodeSelection(selection)) {
        selection = $createNodeSelection();
        $setSelection2(selection);
      }
      if ($isNodeSelection(selection)) {
        if (selected)
          selection.add(toValue3(key));
        else
          selection.delete(toValue3(key));
      }
    });
  };
  const clearSelection = () => {
    editor.update(() => {
      const selection = $getSelection2();
      if ($isNodeSelection(selection))
        selection.clear();
    });
  };
  return {
    isSelected: readonly4(isSelected),
    setSelected,
    clearSelection
  };
}

// src/composables/useLexicalTextEntity.ts
import { registerLexicalTextEntity } from "@lexical/text";
import { mergeRegister as mergeRegister3 } from "@lexical/utils";
function useLexicalTextEntity(getMatch, targetNode, createNode) {
  const editor = useLexicalComposer();
  useMounted(() => {
    return mergeRegister3(
      ...registerLexicalTextEntity(editor, getMatch, targetNode, createNode)
    );
  });
}

// src/composables/useList.ts
import {
  $handleListInsertParagraph,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  insertList,
  removeList
} from "@lexical/list";
import { mergeRegister as mergeRegister4 } from "@lexical/utils";
import {
  COMMAND_PRIORITY_LOW,
  INSERT_PARAGRAPH_COMMAND
} from "lexical";
function useList(editor) {
  useMounted(() => {
    return mergeRegister4(
      editor.registerCommand(
        INSERT_ORDERED_LIST_COMMAND,
        () => {
          insertList(editor, "number");
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        INSERT_UNORDERED_LIST_COMMAND,
        () => {
          insertList(editor, "bullet");
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        REMOVE_LIST_COMMAND,
        () => {
          removeList(editor);
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => {
          const hasHandledInsertParagraph = $handleListInsertParagraph();
          if (hasHandledInsertParagraph)
            return true;
          return false;
        },
        COMMAND_PRIORITY_LOW
      )
    );
  });
}

// src/composables/usePlainTextSetup.ts
import { registerDragonSupport } from "@lexical/dragon";
import { registerPlainText } from "@lexical/plain-text";
import { mergeRegister as mergeRegister5 } from "@lexical/utils";
function usePlainTextSetup(editor) {
  useMounted(() => {
    return mergeRegister5(
      registerPlainText(editor),
      registerDragonSupport(editor)
    );
  });
}

// src/composables/useRichTextSetup.ts
import { registerDragonSupport as registerDragonSupport2 } from "@lexical/dragon";
import { registerRichText } from "@lexical/rich-text";
import { mergeRegister as mergeRegister6 } from "@lexical/utils";
function useRichTextSetup(editor) {
  useMounted(() => {
    return mergeRegister6(
      registerRichText(editor),
      registerDragonSupport2(editor)
    );
  });
}

// src/composables/useTableOfContents.ts
import { $isHeadingNode, HeadingNode } from "@lexical/rich-text";
import { $getNextRightPreorderNode, mergeRegister as mergeRegister7 } from "@lexical/utils";
import {
  $getNodeByKey as $getNodeByKey2,
  $getRoot,
  $isElementNode,
  TextNode
} from "lexical";
import { ref as ref5 } from "vue";
function toEntry(heading) {
  return [heading.getKey(), heading.getTextContent(), heading.getTag()];
}
function $insertHeadingIntoTableOfContents(prevHeading, newHeading, currentTableOfContents) {
  if (newHeading === null)
    return currentTableOfContents;
  const newEntry = toEntry(newHeading);
  let newTableOfContents = [];
  if (prevHeading === null) {
    if (currentTableOfContents.length > 0 && currentTableOfContents[0][0] === newHeading.__key) {
      return currentTableOfContents;
    }
    newTableOfContents = [newEntry, ...currentTableOfContents];
  } else {
    for (let i = 0; i < currentTableOfContents.length; i++) {
      const key = currentTableOfContents[i][0];
      newTableOfContents.push(currentTableOfContents[i]);
      if (key === prevHeading.getKey() && key !== newHeading.getKey()) {
        if (i + 1 < currentTableOfContents.length && currentTableOfContents[i + 1][0] === newHeading.__key) {
          return currentTableOfContents;
        }
        newTableOfContents.push(newEntry);
      }
    }
  }
  return newTableOfContents;
}
function $deleteHeadingFromTableOfContents(key, currentTableOfContents) {
  const newTableOfContents = [];
  for (const heading of currentTableOfContents) {
    if (heading[0] !== key)
      newTableOfContents.push(heading);
  }
  return newTableOfContents;
}
function $updateHeadingInTableOfContents(heading, currentTableOfContents) {
  const newTableOfContents = [];
  for (const oldHeading of currentTableOfContents) {
    if (oldHeading[0] === heading.getKey())
      newTableOfContents.push(toEntry(heading));
    else
      newTableOfContents.push(oldHeading);
  }
  return newTableOfContents;
}
function $updateHeadingPosition(prevHeading, heading, currentTableOfContents) {
  const newTableOfContents = [];
  const newEntry = toEntry(heading);
  if (!prevHeading)
    newTableOfContents.push(newEntry);
  for (const oldHeading of currentTableOfContents) {
    if (oldHeading[0] === heading.getKey())
      continue;
    newTableOfContents.push(oldHeading);
    if (prevHeading && oldHeading[0] === prevHeading.getKey())
      newTableOfContents.push(newEntry);
  }
  return newTableOfContents;
}
function $getPreviousHeading(node) {
  let prevHeading = $getNextRightPreorderNode(node);
  while (prevHeading !== null && !$isHeadingNode(prevHeading))
    prevHeading = $getNextRightPreorderNode(prevHeading);
  return prevHeading;
}
function useTableOfContents(editor) {
  const tableOfContents = ref5([]);
  editor.getEditorState().read(() => {
    const root = $getRoot();
    const rootChildren = root.getChildren();
    for (const child of rootChildren) {
      if ($isHeadingNode(child)) {
        tableOfContents.value.push([
          child.getKey(),
          child.getTextContent(),
          child.getTag()
        ]);
      }
    }
  });
  const removeRootUpdateListener = editor.registerUpdateListener(
    ({ editorState, dirtyElements }) => {
      editorState.read(() => {
        const updateChildHeadings = (node) => {
          for (const child of node.getChildren()) {
            if ($isHeadingNode(child)) {
              const prevHeading = $getPreviousHeading(child);
              tableOfContents.value = $updateHeadingPosition(
                prevHeading,
                child,
                tableOfContents.value
              );
            } else if ($isElementNode(child)) {
              updateChildHeadings(child);
            }
          }
        };
        $getRoot().getChildren().forEach((node) => {
          if ($isElementNode(node) && dirtyElements.get(node.__key))
            updateChildHeadings(node);
        });
      });
    }
  );
  const removeHeaderMutationListener = editor.registerMutationListener(
    HeadingNode,
    (mutatedNodes) => {
      editor.getEditorState().read(() => {
        for (const [nodeKey, mutation] of mutatedNodes) {
          if (mutation === "created") {
            const newHeading = $getNodeByKey2(nodeKey);
            if (newHeading !== null) {
              const prevHeading = $getPreviousHeading(newHeading);
              tableOfContents.value = $insertHeadingIntoTableOfContents(
                prevHeading,
                newHeading,
                tableOfContents.value
              );
            }
          } else if (mutation === "destroyed") {
            tableOfContents.value = $deleteHeadingFromTableOfContents(
              nodeKey,
              tableOfContents.value
            );
          } else if (mutation === "updated") {
            const newHeading = $getNodeByKey2(nodeKey);
            if (newHeading !== null) {
              const prevHeading = $getPreviousHeading(newHeading);
              tableOfContents.value = $updateHeadingPosition(
                prevHeading,
                newHeading,
                tableOfContents.value
              );
            }
          }
        }
      });
    }
  );
  const removeTextNodeMutationListener = editor.registerMutationListener(
    TextNode,
    (mutatedNodes) => {
      editor.getEditorState().read(() => {
        for (const [nodeKey, mutation] of mutatedNodes) {
          if (mutation === "updated") {
            const currNode = $getNodeByKey2(nodeKey);
            if (currNode !== null) {
              const parentNode = currNode.getParentOrThrow();
              if ($isHeadingNode(parentNode)) {
                tableOfContents.value = $updateHeadingInTableOfContents(
                  parentNode,
                  tableOfContents.value
                );
              }
            }
          }
        }
      });
    }
  );
  useMounted(() => mergeRegister7(
    removeRootUpdateListener,
    removeHeaderMutationListener,
    removeTextNodeMutationListener
  ));
  return tableOfContents;
}

// src/composables/useYjsCollaboration.ts
import { mergeRegister as mergeRegister8 } from "@lexical/utils";
import {
  CONNECTED_COMMAND,
  TOGGLE_CONNECT_COMMAND,
  createBinding,
  createUndoManager,
  initLocalState,
  setLocalStateFocus,
  syncCursorPositions,
  syncLexicalUpdateToYjs,
  syncYjsChangesToLexical
} from "@lexical/yjs";
import {
  $createParagraphNode,
  $getRoot as $getRoot2,
  $getSelection as $getSelection3,
  BLUR_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  FOCUS_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND
} from "lexical";
import { UndoManager } from "yjs";
import { computed as computed3, ref as ref6, toRaw } from "vue";
function useYjsCollaboration(editor, id, provider, docMap, name, color, shouldBootstrap, initialEditorState, excludedProperties, awarenessData) {
  const isReloadingDoc = ref6(false);
  const doc = ref6(docMap.get(id));
  const binding = computed3(() => createBinding(editor, provider, id, toRaw(doc.value), docMap, excludedProperties));
  const connect = () => {
    provider.connect();
  };
  const disconnect = () => {
    try {
      provider.disconnect();
    } catch {
    }
  };
  useEffect(() => {
    const { root } = binding.value;
    const { awareness } = provider;
    const onStatus = ({ status }) => {
      editor.dispatchCommand(CONNECTED_COMMAND, status === "connected");
    };
    const onSync = (isSynced) => {
      if (shouldBootstrap && isSynced && root.isEmpty() && root._xmlText._length === 0 && isReloadingDoc.value === false) {
        initializeEditor(editor, initialEditorState);
      }
      isReloadingDoc.value = false;
    };
    const onAwarenessUpdate = () => {
      syncCursorPositions(binding.value, provider);
    };
    const onYjsTreeChanges = (events, transaction) => {
      const origin = transaction.origin;
      if (toRaw(origin) !== binding.value) {
        const isFromUndoManger = origin instanceof UndoManager;
        syncYjsChangesToLexical(binding.value, provider, events, isFromUndoManger);
      }
    };
    initLocalState(
      provider,
      name,
      color,
      document.activeElement === editor.getRootElement(),
      awarenessData || {}
    );
    const onProviderDocReload = (ydoc) => {
      clearEditorSkipCollab(editor, binding.value);
      doc.value = ydoc;
      docMap.set(id, ydoc);
      isReloadingDoc.value = true;
    };
    provider.on("reload", onProviderDocReload);
    provider.on("status", onStatus);
    provider.on("sync", onSync);
    awareness.on("update", onAwarenessUpdate);
    root.getSharedType().observeDeep(onYjsTreeChanges);
    const removeListener = editor.registerUpdateListener(
      ({ prevEditorState, editorState, dirtyLeaves, dirtyElements, normalizedNodes, tags }) => {
        if (tags.has("skip-collab") === false) {
          syncLexicalUpdateToYjs(
            binding.value,
            provider,
            prevEditorState,
            editorState,
            dirtyElements,
            dirtyLeaves,
            normalizedNodes,
            tags
          );
        }
      }
    );
    connect();
    return () => {
      if (isReloadingDoc.value === false)
        disconnect();
      provider.off("sync", onSync);
      provider.off("status", onStatus);
      provider.off("reload", onProviderDocReload);
      awareness.off("update", onAwarenessUpdate);
      root.getSharedType().unobserveDeep(onYjsTreeChanges);
      docMap.delete(id);
      removeListener();
    };
  });
  useEffect(() => {
    return editor.registerCommand(
      TOGGLE_CONNECT_COMMAND,
      (payload) => {
        if (connect !== void 0 && disconnect !== void 0) {
          const shouldConnect = payload;
          if (shouldConnect) {
            console.log("Collaboration connected!");
            connect();
          } else {
            console.log("Collaboration disconnected!");
            disconnect();
          }
        }
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  });
  return binding;
}
function useYjsFocusTracking(editor, provider, name, color, awarenessData) {
  useEffect(() => {
    return mergeRegister8(
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          setLocalStateFocus(provider, name, color, true, awarenessData || {});
          return false;
        },
        COMMAND_PRIORITY_EDITOR
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          setLocalStateFocus(provider, name, color, false, awarenessData || {});
          return false;
        },
        COMMAND_PRIORITY_EDITOR
      )
    );
  });
}
function useYjsHistory(editor, binding) {
  const undoManager = computed3(() => createUndoManager(binding, binding.root.getSharedType()));
  useEffect(() => {
    const undo = () => {
      undoManager.value.undo();
    };
    const redo = () => {
      undoManager.value.redo();
    };
    return mergeRegister8(
      editor.registerCommand(
        UNDO_COMMAND,
        () => {
          undo();
          return true;
        },
        COMMAND_PRIORITY_EDITOR
      ),
      editor.registerCommand(
        REDO_COMMAND,
        () => {
          redo();
          return true;
        },
        COMMAND_PRIORITY_EDITOR
      )
    );
  });
  const clearHistory = () => {
    undoManager.value.clear();
  };
  return clearHistory;
}
function initializeEditor(editor, initialEditorState) {
  editor.update(
    () => {
      const root = $getRoot2();
      if (root.isEmpty()) {
        if (initialEditorState) {
          switch (typeof initialEditorState) {
            case "string": {
              const parsedEditorState = editor.parseEditorState(initialEditorState);
              editor.setEditorState(parsedEditorState, { tag: "history-merge" });
              break;
            }
            case "object": {
              editor.setEditorState(initialEditorState, { tag: "history-merge" });
              break;
            }
            case "function": {
              editor.update(
                () => {
                  const root1 = $getRoot2();
                  if (root1.isEmpty())
                    initialEditorState(editor);
                },
                { tag: "history-merge" }
              );
              break;
            }
          }
        } else {
          const paragraph = $createParagraphNode();
          root.append(paragraph);
          const { activeElement } = document;
          if ($getSelection3() !== null || activeElement !== null && activeElement === editor.getRootElement()) {
            paragraph.select();
          }
        }
      }
    },
    {
      tag: "history-merge"
    }
  );
}
function clearEditorSkipCollab(editor, binding) {
  editor.update(
    () => {
      const root = $getRoot2();
      root.clear();
      root.select();
    },
    {
      tag: "skip-collab"
    }
  );
  if (binding.cursors == null)
    return;
  const cursors = binding.cursors;
  if (cursors == null)
    return;
  const cursorsContainer = binding.cursorsContainer;
  if (cursorsContainer == null)
    return;
  const cursorsArr = Array.from(cursors.values());
  for (let i = 0; i < cursorsArr.length; i++) {
    const cursor = cursorsArr[i];
    const selection = cursor.selection;
    if (selection && selection.selections !== null) {
      const selections = selection.selections;
      for (let j = 0; j < selections.length; j++) cursorsContainer.removeChild(selections[i]);
    }
  }
}

// src/components/LexicalDecoratedTeleports.ts
import { defineComponent } from "vue";
var LexicalDecoratedTeleports_default = defineComponent({
  name: "LexicalDecoratedTeleports",
  setup() {
    const editor = useLexicalComposer();
    const decorators = useDecorators(editor);
    return () => decorators.value;
  }
});

// src/components/LexicalContentEditable.vue
import { defineComponent as _defineComponent2 } from "vue";
import { unref as _unref, mergeProps as _mergeProps2, createVNode as _createVNode, renderSlot as _renderSlot, openBlock as _openBlock2, createElementBlock as _createElementBlock2, createCommentVNode as _createCommentVNode, Fragment as _Fragment } from "vue";
import { ref as ref8 } from "vue";

// src/components/LexicalContentEditableElement.vue
import { defineComponent as _defineComponent } from "vue";
import { mergeProps as _mergeProps, openBlock as _openBlock, createElementBlock as _createElementBlock } from "vue";
import { computed as computed4, ref as ref7 } from "vue";
var _hoisted_1 = ["aria-activedescendant", "aria-autocomplete", "aria-controls", "aria-describedby", "aria-expanded", "aria-label", "aria-labelledby", "aria-multiline", "aria-owns", "aria-readonly", "aria-required", "autocapitalize", "contenteditable", "data-testid", "role", "spellcheck", "tabindex"];
var _sfc_main = /* @__PURE__ */ _defineComponent({
  __name: "LexicalContentEditableElement",
  props: {
    editor: {},
    ariaActiveDescendant: {},
    ariaAutoComplete: {},
    ariaControls: {},
    ariaDescribedBy: {},
    ariaErrorMessage: {},
    ariaExpanded: { type: [Boolean, String] },
    ariaInvalid: { type: [Boolean, String] },
    ariaLabel: {},
    ariaLabelledBy: {},
    ariaMultiline: { type: [Boolean, String] },
    ariaOwns: {},
    ariaRequired: { type: [Boolean, String] },
    dataTestid: {},
    innerHTML: {},
    class: {},
    style: { type: [Boolean, null, String, Object, Array] },
    accesskey: {},
    contenteditable: { type: [Boolean, String] },
    contextmenu: {},
    dir: {},
    draggable: { type: [Boolean, String] },
    hidden: { type: [Boolean, String] },
    id: {},
    inert: { type: [Boolean, String] },
    lang: {},
    spellcheck: { type: [Boolean, String], default: true },
    tabindex: {},
    title: {},
    translate: {},
    radiogroup: {},
    role: { default: "textbox" },
    about: {},
    datatype: {},
    inlist: {},
    property: {},
    resource: {},
    typeof: {},
    vocab: {},
    autocapitalize: {},
    autocorrect: {},
    autosave: {},
    color: {},
    itemprop: {},
    itemscope: { type: [Boolean, String] },
    itemtype: {},
    itemid: {},
    itemref: {},
    results: {},
    security: {},
    unselectable: {},
    inputmode: {},
    is: {},
    "aria-activedescendant": {},
    "aria-atomic": { type: [Boolean, String] },
    "aria-autocomplete": {},
    "aria-busy": { type: [Boolean, String] },
    "aria-checked": { type: [Boolean, String] },
    "aria-colcount": {},
    "aria-colindex": {},
    "aria-colspan": {},
    "aria-controls": {},
    "aria-current": { type: [Boolean, String] },
    "aria-describedby": {},
    "aria-details": {},
    "aria-disabled": { type: [Boolean, String] },
    "aria-dropeffect": {},
    "aria-errormessage": {},
    "aria-expanded": { type: [Boolean, String] },
    "aria-flowto": {},
    "aria-grabbed": { type: [Boolean, String] },
    "aria-haspopup": { type: [Boolean, String] },
    "aria-hidden": { type: [Boolean, String] },
    "aria-invalid": { type: [Boolean, String] },
    "aria-keyshortcuts": {},
    "aria-label": {},
    "aria-labelledby": {},
    "aria-level": {},
    "aria-live": {},
    "aria-modal": { type: [Boolean, String] },
    "aria-multiline": { type: [Boolean, String] },
    "aria-multiselectable": { type: [Boolean, String] },
    "aria-orientation": {},
    "aria-owns": {},
    "aria-placeholder": {},
    "aria-posinset": {},
    "aria-pressed": { type: [Boolean, String] },
    "aria-readonly": { type: [Boolean, String] },
    "aria-relevant": {},
    "aria-required": { type: [Boolean, String] },
    "aria-roledescription": {},
    "aria-rowcount": {},
    "aria-rowindex": {},
    "aria-rowspan": {},
    "aria-selected": { type: [Boolean, String] },
    "aria-setsize": {},
    "aria-sort": {},
    "aria-valuemax": {},
    "aria-valuemin": {},
    "aria-valuenow": {},
    "aria-valuetext": {}
  },
  setup(__props) {
    const props = __props;
    const root = ref7(null);
    const isEditable = ref7(props.editor.isEditable());
    const otherAttrs = computed4(() => {
      const ariaAttrs = {};
      if (props.ariaInvalid != null)
        ariaAttrs["aria-invalid"] = props.ariaInvalid;
      if (props.ariaErrorMessage != null)
        ariaAttrs["aria-errormessage"] = props.ariaErrorMessage;
      return {
        ...props,
        ...ariaAttrs
      };
    });
    useMounted(() => {
      function handleRef(rootElement) {
        if (rootElement && rootElement.ownerDocument && rootElement.ownerDocument.defaultView) {
          props.editor.setRootElement(rootElement);
        } else {
          props.editor.setRootElement(null);
        }
      }
      handleRef(root.value);
      isEditable.value = props.editor.isEditable();
      return props.editor.registerEditableListener((currentIsEditable) => {
        isEditable.value = currentIsEditable;
      });
    });
    return (_ctx, _cache) => {
      return _openBlock(), _createElementBlock("div", _mergeProps({
        ref_key: "root",
        ref: root
      }, otherAttrs.value, {
        "aria-activedescendant": isEditable.value ? _ctx.ariaActiveDescendant : void 0,
        "aria-autocomplete": isEditable.value ? _ctx.ariaAutoComplete : "none",
        "aria-controls": isEditable.value ? _ctx.ariaControls : void 0,
        "aria-describedby": _ctx.ariaDescribedBy,
        "aria-expanded": isEditable.value && _ctx.role === "combobox" ? !!_ctx.ariaExpanded : void 0,
        "aria-label": _ctx.ariaLabel,
        "aria-labelledby": _ctx.ariaLabelledBy,
        "aria-multiline": _ctx.ariaMultiline,
        "aria-owns": isEditable.value ? _ctx.ariaOwns : void 0,
        "aria-readonly": isEditable.value ? void 0 : true,
        "aria-required": _ctx.ariaRequired,
        autocapitalize: _ctx.autocapitalize,
        contenteditable: isEditable.value,
        "data-testid": _ctx.dataTestid,
        role: isEditable.value ? _ctx.role : void 0,
        spellcheck: _ctx.spellcheck,
        style: _ctx.style,
        tabindex: _ctx.tabindex
      }), null, 16, _hoisted_1);
    };
  }
});
var LexicalContentEditableElement_default = _sfc_main;

// src/components/LexicalContentEditable.vue
var _hoisted_12 = {
  key: 0,
  "aria-hidden": "true"
};
var _sfc_main2 = /* @__PURE__ */ _defineComponent2({
  __name: "LexicalContentEditable",
  props: {
    ariaActiveDescendant: {},
    ariaAutoComplete: {},
    ariaControls: {},
    ariaDescribedBy: {},
    ariaErrorMessage: {},
    ariaExpanded: {},
    ariaInvalid: {},
    ariaLabel: {},
    ariaLabelledBy: {},
    ariaMultiline: {},
    ariaOwns: {},
    ariaRequired: {},
    dataTestid: {},
    innerHTML: {},
    class: {},
    style: { type: [Boolean, null, String, Object, Array] },
    accesskey: {},
    contenteditable: { type: [Boolean, String] },
    contextmenu: {},
    dir: {},
    draggable: { type: [Boolean, String] },
    hidden: { type: [Boolean, String] },
    id: {},
    inert: { type: [Boolean, String] },
    lang: {},
    spellcheck: { type: [Boolean, String], default: true },
    tabindex: {},
    title: {},
    translate: {},
    radiogroup: {},
    role: { default: "textbox" },
    about: {},
    datatype: {},
    inlist: {},
    property: {},
    resource: {},
    typeof: {},
    vocab: {},
    autocapitalize: {},
    autocorrect: {},
    autosave: {},
    color: {},
    itemprop: {},
    itemscope: { type: [Boolean, String] },
    itemtype: {},
    itemid: {},
    itemref: {},
    results: {},
    security: {},
    unselectable: {},
    inputmode: {},
    is: {},
    "aria-activedescendant": {},
    "aria-atomic": { type: [Boolean, String] },
    "aria-autocomplete": {},
    "aria-busy": { type: [Boolean, String] },
    "aria-checked": { type: [Boolean, String] },
    "aria-colcount": {},
    "aria-colindex": {},
    "aria-colspan": {},
    "aria-controls": {},
    "aria-current": { type: [Boolean, String] },
    "aria-describedby": {},
    "aria-details": {},
    "aria-disabled": { type: [Boolean, String] },
    "aria-dropeffect": {},
    "aria-errormessage": {},
    "aria-expanded": { type: [Boolean, String] },
    "aria-flowto": {},
    "aria-grabbed": { type: [Boolean, String] },
    "aria-haspopup": { type: [Boolean, String] },
    "aria-hidden": { type: [Boolean, String] },
    "aria-invalid": { type: [Boolean, String] },
    "aria-keyshortcuts": {},
    "aria-label": {},
    "aria-labelledby": {},
    "aria-level": {},
    "aria-live": {},
    "aria-modal": { type: [Boolean, String] },
    "aria-multiline": { type: [Boolean, String] },
    "aria-multiselectable": { type: [Boolean, String] },
    "aria-orientation": {},
    "aria-owns": {},
    "aria-placeholder": {},
    "aria-posinset": {},
    "aria-pressed": { type: [Boolean, String] },
    "aria-readonly": { type: [Boolean, String] },
    "aria-relevant": {},
    "aria-required": { type: [Boolean, String] },
    "aria-roledescription": {},
    "aria-rowcount": {},
    "aria-rowindex": {},
    "aria-rowspan": {},
    "aria-selected": { type: [Boolean, String] },
    "aria-setsize": {},
    "aria-sort": {},
    "aria-valuemax": {},
    "aria-valuemin": {},
    "aria-valuenow": {},
    "aria-valuetext": {}
  },
  setup(__props) {
    const editor = useLexicalComposer();
    const isEditable = ref8(false);
    const showPlaceholder = useCanShowPlaceholder(editor);
    useMounted(() => {
      isEditable.value = editor.isEditable();
      return editor.registerEditableListener((currentIsEditable) => {
        isEditable.value = currentIsEditable;
      });
    });
    return (_ctx, _cache) => {
      return _openBlock2(), _createElementBlock2(
        _Fragment,
        null,
        [
          _createVNode(LexicalContentEditableElement_default, _mergeProps2({ editor: _unref(editor) }, _ctx.$props), null, 16, ["editor"]),
          _unref(showPlaceholder) ? (_openBlock2(), _createElementBlock2("div", _hoisted_12, [
            _renderSlot(_ctx.$slots, "placeholder")
          ])) : _createCommentVNode("v-if", true)
        ],
        64
        /* STABLE_FRAGMENT */
      );
    };
  }
});
var LexicalContentEditable_default = _sfc_main2;

// src/components/LexicalPlainTextPlugin.vue
import { defineComponent as _defineComponent3 } from "vue";
import { unref as _unref2, renderSlot as _renderSlot2, createCommentVNode as _createCommentVNode2, createVNode as _createVNode2, Fragment as _Fragment2, openBlock as _openBlock3, createElementBlock as _createElementBlock3 } from "vue";
var _sfc_main3 = /* @__PURE__ */ _defineComponent3({
  __name: "LexicalPlainTextPlugin",
  setup(__props) {
    const editor = useLexicalComposer();
    const showPlaceholder = useCanShowPlaceholder(editor);
    usePlainTextSetup(editor);
    return (_ctx, _cache) => {
      return _openBlock3(), _createElementBlock3(
        _Fragment2,
        null,
        [
          _unref2(showPlaceholder) ? _renderSlot2(_ctx.$slots, "placeholder", { key: 0 }) : _createCommentVNode2("v-if", true),
          _renderSlot2(_ctx.$slots, "contentEditable"),
          _createVNode2(_unref2(LexicalDecoratedTeleports_default))
        ],
        64
        /* STABLE_FRAGMENT */
      );
    };
  }
});
var LexicalPlainTextPlugin_default = _sfc_main3;

// src/components/LexicalComposer.vue
import { defineComponent as _defineComponent4 } from "vue";
import { renderSlot as _renderSlot3 } from "vue";
import { onMounted as onMounted2, provide } from "vue";
import { $createParagraphNode as $createParagraphNode2, $getRoot as $getRoot3, $getSelection as $getSelection4, createEditor } from "lexical";
var _sfc_main4 = /* @__PURE__ */ _defineComponent4({
  __name: "LexicalComposer",
  props: {
    initialConfig: {}
  },
  emits: ["error"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const HISTORY_MERGE_OPTIONS = { tag: "history-merge" };
    const {
      theme,
      namespace,
      nodes,
      onError,
      editorState: initialEditorState,
      html
    } = props.initialConfig;
    const editor = createEditor({
      editable: props.initialConfig.editable,
      html,
      namespace,
      nodes,
      theme,
      onError(error) {
        emit("error", error, editor);
        onError?.(error, editor);
      }
    });
    initializeEditor2(editor, initialEditorState);
    function initializeEditor2(editor2, initialEditorState2) {
      if (initialEditorState2 === null)
        return;
      if (initialEditorState2 === void 0) {
        editor2.update(() => {
          const root = $getRoot3();
          if (root.isEmpty()) {
            const paragraph = $createParagraphNode2();
            root.append(paragraph);
            const activeElement = document.activeElement;
            if ($getSelection4() !== null || activeElement !== null && activeElement === editor2.getRootElement()) {
              paragraph.select();
            }
          }
        }, HISTORY_MERGE_OPTIONS);
      } else if (initialEditorState2 !== null) {
        switch (typeof initialEditorState2) {
          case "string": {
            const parsedEditorState = editor2.parseEditorState(initialEditorState2);
            editor2.setEditorState(parsedEditorState, HISTORY_MERGE_OPTIONS);
            break;
          }
          case "object": {
            editor2.setEditorState(initialEditorState2, HISTORY_MERGE_OPTIONS);
            break;
          }
          case "function": {
            editor2.update(() => {
              const root = $getRoot3();
              if (root.isEmpty())
                initialEditorState2(editor2);
            }, HISTORY_MERGE_OPTIONS);
            break;
          }
        }
      }
    }
    provide(LexicalEditorProviderKey, editor);
    onMounted2(() => {
      const isEditable = props.initialConfig.editable;
      editor.setEditable(isEditable !== void 0 ? isEditable : true);
    });
    return (_ctx, _cache) => {
      return _renderSlot3(_ctx.$slots, "default");
    };
  }
});
var LexicalComposer_default = _sfc_main4;

// src/components/LexicalOnChangePlugin.vue
import { defineComponent as _defineComponent5 } from "vue";
import { watchEffect as watchEffect5 } from "vue";
var _sfc_main5 = /* @__PURE__ */ _defineComponent5({
  __name: "LexicalOnChangePlugin",
  props: {
    ignoreInitialChange: { type: Boolean, default: true },
    ignoreSelectionChange: { type: Boolean, default: false },
    ignoreHistoryMergeTagChange: { type: Boolean, default: true }
  },
  emits: ["change"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const editor = useLexicalComposer();
    watchEffect5(() => {
      return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, prevEditorState, tags }) => {
        if (props.ignoreSelectionChange && dirtyElements.size === 0 && dirtyLeaves.size === 0 || props.ignoreHistoryMergeTagChange && tags.has("history-merge") || props.ignoreInitialChange && prevEditorState.isEmpty()) {
          return;
        }
        emit("change", editorState, editor, tags);
      });
    });
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalOnChangePlugin_default = _sfc_main5;

// src/components/LexicalHistoryPlugin.vue
import { defineComponent as _defineComponent6 } from "vue";
var _sfc_main6 = /* @__PURE__ */ _defineComponent6({
  __name: "LexicalHistoryPlugin",
  props: {
    delay: {},
    externalHistoryState: {}
  },
  setup(__props) {
    const props = __props;
    const editor = useLexicalComposer();
    useHistory(editor, () => props.externalHistoryState, () => props.delay);
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalHistoryPlugin_default = _sfc_main6;

// src/components/LexicalTreeViewPlugin.vue
import { defineComponent as _defineComponent7 } from "vue";
import { createElementVNode as _createElementVNode, openBlock as _openBlock4, createElementBlock as _createElementBlock4, createCommentVNode as _createCommentVNode3, toDisplayString as _toDisplayString, normalizeClass as _normalizeClass } from "vue";
import { $generateHtmlFromNodes } from "@lexical/html";
import { $isLinkNode } from "@lexical/link";
import { $isMarkNode } from "@lexical/mark";
import { $isTableSelection } from "@lexical/table";
import { mergeRegister as mergeRegister9 } from "@lexical/utils";
import {
  $getRoot as $getRoot4,
  $getSelection as $getSelection5,
  $isElementNode as $isElementNode2,
  $isNodeSelection as $isNodeSelection2,
  $isRangeSelection as $isRangeSelection2,
  $isTextNode as $isTextNode2
} from "lexical";
import { computed as computed5, ref as ref9, watchEffect as watchEffect6 } from "vue";
var _hoisted_13 = {
  key: 0,
  style: { "padding": "20px" }
};
var _hoisted_2 = { key: 1 };
var _hoisted_3 = ["max"];
var _sfc_main7 = /* @__PURE__ */ _defineComponent7({
  __name: "LexicalTreeViewPlugin",
  props: {
    treeTypeButtonClassName: {},
    timeTravelButtonClassName: {},
    timeTravelPanelSliderClassName: {},
    timeTravelPanelButtonClassName: {},
    timeTravelPanelClassName: {},
    viewClassName: {}
  },
  setup(__props) {
    const NON_SINGLE_WIDTH_CHARS_REPLACEMENT = Object.freeze({
      "	": "\\t",
      "\n": "\\n"
    });
    const NON_SINGLE_WIDTH_CHARS_REGEX = new RegExp(
      Object.keys(NON_SINGLE_WIDTH_CHARS_REPLACEMENT).join("|"),
      "g"
    );
    const SYMBOLS = Object.freeze({
      ancestorHasNextSibling: "|",
      ancestorIsLastChild: " ",
      hasNextSibling: "\u251C",
      isLastChild: "\u2514",
      selectedChar: "^",
      selectedLine: ">"
    });
    function printRangeSelection(selection) {
      let res = "";
      const formatText = printFormatProperties(selection);
      res += `: range ${formatText !== "" ? `{ ${formatText} }` : ""}`;
      const anchor = selection.anchor;
      const focus = selection.focus;
      const anchorOffset = anchor.offset;
      const focusOffset = focus.offset;
      res += `
  \u251C anchor { key: ${anchor.key}, offset: ${anchorOffset === null ? "null" : anchorOffset}, type: ${anchor.type} }`;
      res += `
  \u2514 focus { key: ${focus.key}, offset: ${focusOffset === null ? "null" : focusOffset}, type: ${focus.type} }`;
      return res;
    }
    function generateContent(editor2, commandsLog2, exportDOM) {
      const editorState = editor2.getEditorState();
      const editorConfig = editor2._config;
      const compositionKey = editor2._compositionKey;
      const editable = editor2._editable;
      if (exportDOM) {
        let htmlString = "";
        editorState.read(() => {
          htmlString = printPrettyHTML($generateHtmlFromNodes(editor2));
        });
        return htmlString;
      }
      let res = " root\n";
      const selectionString = editorState.read(() => {
        const selection = $getSelection5();
        visitTree($getRoot4(), (node, indent) => {
          const nodeKey = node.getKey();
          const nodeKeyDisplay = `(${nodeKey})`;
          const typeDisplay = node.getType() || "";
          const isSelected = node.isSelected();
          const idsDisplay = $isMarkNode(node) ? ` id: [ ${node.getIDs().join(", ")} ] ` : "";
          res += `${isSelected ? SYMBOLS.selectedLine : " "} ${indent.join(
            " "
          )} ${nodeKeyDisplay} ${typeDisplay} ${idsDisplay} ${printNode(node)}
`;
          res += printSelectedCharsLine({
            indent,
            isSelected,
            node,
            nodeKeyDisplay,
            selection,
            typeDisplay
          });
        });
        return selection === null ? ": null" : $isRangeSelection2(selection) ? printRangeSelection(selection) : $isTableSelection(selection) ? printTableSelection(selection) : printNodeSelection(selection);
      });
      res += `
 selection${selectionString}`;
      res += "\n\n commands:";
      if (commandsLog2.length) {
        for (const { type, payload } of commandsLog2) {
          res += `
  \u2514 { type: ${type}, payload: ${payload instanceof Event ? payload.constructor.name : payload} }`;
        }
      } else {
        res += "\n  \u2514 None dispatched.";
      }
      res += "\n\n editor:";
      res += `
  \u2514 namespace ${editorConfig.namespace}`;
      if (compositionKey !== null)
        res += `
  \u2514 compositionKey ${compositionKey}`;
      res += `
  \u2514 editable ${String(editable)}`;
      return res;
    }
    function printNodeSelection(selection) {
      if (!$isNodeSelection2(selection))
        return "";
      return `: node
  \u2514 [${Array.from(selection._nodes).join(", ")}]`;
    }
    function printTableSelection(selection) {
      return `: table
  \u2514 { table: ${selection.tableKey}, anchorCell: ${selection.anchor.key}, focusCell: ${selection.focus.key} }`;
    }
    function visitTree(currentNode, visitor, indent = []) {
      const childNodes = currentNode.getChildren();
      const childNodesLength = childNodes.length;
      childNodes.forEach((childNode, i) => {
        visitor(
          childNode,
          indent.concat(
            i === childNodesLength - 1 ? SYMBOLS.isLastChild : SYMBOLS.hasNextSibling
          )
        );
        if ($isElementNode2(childNode)) {
          visitTree(
            childNode,
            visitor,
            indent.concat(
              i === childNodesLength - 1 ? SYMBOLS.ancestorIsLastChild : SYMBOLS.ancestorHasNextSibling
            )
          );
        }
      });
    }
    function normalize(text) {
      return Object.entries(NON_SINGLE_WIDTH_CHARS_REPLACEMENT).reduce(
        (acc, [key, value]) => acc.replace(new RegExp(key, "g"), String(value)),
        text
      );
    }
    function printNode(node) {
      if ($isTextNode2(node)) {
        const text = node.getTextContent();
        const title = text.length === 0 ? "(empty)" : `"${normalize(text)}"`;
        const properties = printAllTextNodeProperties(node);
        return [title, properties.length !== 0 ? `{ ${properties} }` : null].filter(Boolean).join(" ").trim();
      } else if ($isLinkNode(node)) {
        const link = node.getURL();
        const title = link.length === 0 ? "(empty)" : `"${normalize(link)}"`;
        const properties = printAllLinkNodeProperties(node);
        return [title, properties.length !== 0 ? `{ ${properties} }` : null].filter(Boolean).join(" ").trim();
      } else {
        return "";
      }
    }
    const FORMAT_PREDICATES = [
      (node) => node.hasFormat("bold") && "Bold",
      (node) => node.hasFormat("code") && "Code",
      (node) => node.hasFormat("italic") && "Italic",
      (node) => node.hasFormat("strikethrough") && "Strikethrough",
      (node) => node.hasFormat("subscript") && "Subscript",
      (node) => node.hasFormat("superscript") && "Superscript",
      (node) => node.hasFormat("underline") && "Underline"
    ];
    const DETAIL_PREDICATES = [
      (node) => node.isDirectionless() && "Directionless",
      (node) => node.isUnmergeable() && "Unmergeable"
    ];
    const MODE_PREDICATES = [
      (node) => node.isToken() && "Token",
      (node) => node.isSegmented() && "Segmented"
    ];
    function printAllTextNodeProperties(node) {
      return [
        printFormatProperties(node),
        printDetailProperties(node),
        printModeProperties(node)
      ].filter(Boolean).join(", ");
    }
    function printAllLinkNodeProperties(node) {
      return [
        printTargetProperties(node),
        printRelProperties(node),
        printTitleProperties(node)
      ].filter(Boolean).join(", ");
    }
    function printDetailProperties(nodeOrSelection) {
      let str = DETAIL_PREDICATES.map((predicate) => predicate(nodeOrSelection)).filter(Boolean).join(", ").toLocaleLowerCase();
      if (str !== "")
        str = `detail: ${str}`;
      return str;
    }
    function printModeProperties(nodeOrSelection) {
      let str = MODE_PREDICATES.map((predicate) => predicate(nodeOrSelection)).filter(Boolean).join(", ").toLocaleLowerCase();
      if (str !== "")
        str = `mode: ${str}`;
      return str;
    }
    function printFormatProperties(nodeOrSelection) {
      let str = FORMAT_PREDICATES.map((predicate) => predicate(nodeOrSelection)).filter(Boolean).join(", ").toLocaleLowerCase();
      if (str !== "")
        str = `format: ${str}`;
      return str;
    }
    function printTargetProperties(node) {
      let str = node.getTarget();
      if (str != null)
        str = `target: ${str}`;
      return str;
    }
    function printRelProperties(node) {
      let str = node.getRel();
      if (str != null)
        str = `rel: ${str}`;
      return str;
    }
    function printTitleProperties(node) {
      let str = node.getTitle();
      if (str != null)
        str = `title: ${str}`;
      return str;
    }
    function printSelectedCharsLine({
      indent,
      isSelected,
      node,
      nodeKeyDisplay,
      selection,
      typeDisplay
    }) {
      if (!$isTextNode2(node) || !$isRangeSelection2(selection) || !isSelected || $isElementNode2(node)) {
        return "";
      }
      const anchor = selection.anchor;
      const focus = selection.focus;
      if (node.getTextContent() === "" || anchor.getNode() === selection.focus.getNode() && anchor.offset === focus.offset) {
        return "";
      }
      const [start, end] = $getSelectionStartEnd(node, selection);
      if (start === end)
        return "";
      const selectionLastIndent = indent[indent.length - 1] === SYMBOLS.hasNextSibling ? SYMBOLS.ancestorHasNextSibling : SYMBOLS.ancestorIsLastChild;
      const indentionChars = [
        ...indent.slice(0, indent.length - 1),
        selectionLastIndent
      ];
      const unselectedChars = Array(start + 1).fill(" ");
      const selectedChars = Array(end - start).fill(SYMBOLS.selectedChar);
      const paddingLength = typeDisplay.length + 3;
      const nodePrintSpaces = Array(nodeKeyDisplay.length + paddingLength).fill(
        " "
      );
      return `${[
        SYMBOLS.selectedLine,
        indentionChars.join(" "),
        [...nodePrintSpaces, ...unselectedChars, ...selectedChars].join("")
      ].join(" ")}
`;
    }
    function printPrettyHTML(str) {
      const div = document.createElement("div");
      div.innerHTML = str.trim();
      return prettifyHTML(div, 0).innerHTML;
    }
    function prettifyHTML(node, level) {
      const indentBefore = Array.from({ length: level++ + 1 }).join("  ");
      const indentAfter = Array.from({ length: level - 1 }).join("  ");
      let textNode;
      for (let i = 0; i < node.children.length; i++) {
        textNode = document.createTextNode(`
${indentBefore}`);
        node.insertBefore(textNode, node.children[i]);
        prettifyHTML(node.children[i], level);
        if (node.lastElementChild === node.children[i]) {
          textNode = document.createTextNode(`
${indentAfter}`);
          node.appendChild(textNode);
        }
      }
      return node;
    }
    function $getSelectionStartEnd(node, selection) {
      const anchorAndFocus = selection.getStartEndPoints();
      if ($isNodeSelection2(selection) || anchorAndFocus === null)
        return [-1, -1];
      const [anchor, focus] = anchorAndFocus;
      const textContent = node.getTextContent();
      const textLength = textContent.length;
      let start = -1;
      let end = -1;
      if (anchor.type === "text" && focus.type === "text") {
        const anchorNode = anchor.getNode();
        const focusNode = focus.getNode();
        if (anchorNode === focusNode && node === anchorNode && anchor.offset !== focus.offset) {
          [start, end] = anchor.offset < focus.offset ? [anchor.offset, focus.offset] : [focus.offset, anchor.offset];
        } else if (node === anchorNode) {
          [start, end] = anchorNode.isBefore(focusNode) ? [anchor.offset, textLength] : [0, anchor.offset];
        } else if (node === focusNode) {
          [start, end] = focusNode.isBefore(anchorNode) ? [focus.offset, textLength] : [0, focus.offset];
        } else {
          [start, end] = [0, textLength];
        }
      }
      const numNonSingleWidthCharBeforeSelection = (textContent.slice(0, start).match(NON_SINGLE_WIDTH_CHARS_REGEX) || []).length;
      const numNonSingleWidthCharInSelection = (textContent.slice(start, end).match(NON_SINGLE_WIDTH_CHARS_REGEX) || []).length;
      return [
        start + numNonSingleWidthCharBeforeSelection,
        end + numNonSingleWidthCharBeforeSelection + numNonSingleWidthCharInSelection
      ];
    }
    const editor = useLexicalComposer();
    const timeStampedEditorStates = ref9([]);
    const content = ref9("");
    const timeTravelEnabled = ref9(false);
    const showExportDOM = ref9(false);
    const playingIndexRef = ref9(0);
    const treeElementRef = ref9(null);
    const inputRef = ref9(null);
    const isPlaying = ref9(false);
    const isLimited = ref9(false);
    const showLimited = ref9(false);
    const lastEditorStateRef = ref9(null);
    const commandsLog = useLexicalCommandsLog(editor);
    function generateTree(editorState) {
      const treeText = generateContent(editor, commandsLog.value, showExportDOM.value);
      content.value = treeText;
      if (!timeTravelEnabled.value) {
        timeStampedEditorStates.value = [
          ...timeStampedEditorStates.value,
          [Date.now(), editorState]
        ];
      }
    }
    watchEffect6(() => {
      const editorState = editor.getEditorState();
      if (!showLimited.value && editorState._nodeMap.size < 1e3)
        content.value = generateContent(editor, commandsLog.value, showExportDOM.value);
    });
    watchEffect6((onInvalidate) => {
      const unregisterListener = mergeRegister9(
        editor.registerUpdateListener(({ editorState }) => {
          if (!showLimited.value && editorState._nodeMap.size > 1e3) {
            lastEditorStateRef.value = editorState;
            isLimited.value = true;
            if (!showLimited.value)
              return;
          }
          generateTree(editorState);
        }),
        editor.registerEditableListener(() => {
          const treeText = generateContent(editor, commandsLog.value, showExportDOM.value);
          content.value = treeText;
        })
      );
      onInvalidate(() => {
        unregisterListener();
      });
    });
    const totalEditorStates = computed5(() => timeStampedEditorStates.value.length);
    let timeoutId;
    watchEffect6((onInvalidate) => {
      if (isPlaying.value) {
        const play = () => {
          const currentIndex = playingIndexRef.value;
          if (currentIndex === totalEditorStates.value - 1) {
            isPlaying.value = false;
            return;
          }
          const currentTime = timeStampedEditorStates.value[currentIndex][0];
          const nextTime = timeStampedEditorStates.value[currentIndex + 1][0];
          const timeDiff = nextTime - currentTime;
          timeoutId = setTimeout(() => {
            playingIndexRef.value++;
            const index = playingIndexRef.value;
            const input = inputRef.value;
            if (input !== null)
              input.value = String(index);
            editor.setEditorState(timeStampedEditorStates.value[index][1]);
            play();
          }, timeDiff);
        };
        play();
      }
      onInvalidate(() => {
        clearTimeout(timeoutId);
      });
    });
    let element = null;
    watchEffect6((onInvalidate) => {
      element = treeElementRef.value;
      if (element !== null) {
        element.__lexicalEditor = editor;
        onInvalidate(() => {
          element.__lexicalEditor = null;
        });
      }
    });
    function enableTimeTravel() {
      const rootElement = editor.getRootElement();
      if (rootElement !== null) {
        rootElement.contentEditable = "false";
        playingIndexRef.value = totalEditorStates.value - 1;
        timeTravelEnabled.value = true;
      }
    }
    function updateEditorState(e) {
      const editorStateIndex = Number(e.target.value);
      const timeStampedEditorState = timeStampedEditorStates.value[editorStateIndex];
      if (timeStampedEditorState) {
        playingIndexRef.value = editorStateIndex;
        editor.setEditorState(timeStampedEditorState[1]);
      }
    }
    function exit() {
      const rootElement = editor.getRootElement();
      if (rootElement) {
        rootElement.contentEditable = "true";
        const index = timeStampedEditorStates.value.length - 1;
        const timeStampedEditorState = timeStampedEditorStates.value[index];
        editor.setEditorState(timeStampedEditorState[1]);
        const input = inputRef.value;
        if (input)
          input.value = String(index);
        timeTravelEnabled.value = false;
        isPlaying.value = false;
      }
    }
    return (_ctx, _cache) => {
      return _openBlock4(), _createElementBlock4(
        "div",
        {
          class: _normalizeClass(_ctx.viewClassName)
        },
        [
          showLimited.value && isLimited.value ? (_openBlock4(), _createElementBlock4("div", _hoisted_13, [
            _cache[3] || (_cache[3] = _createElementVNode(
              "span",
              { style: { "margin-right": "20px" } },
              " Detected large EditorState, this can impact debugging performance. ",
              -1
              /* HOISTED */
            )),
            _createElementVNode("button", {
              style: { "background": "transparent", "border": "1px solid white", "color": "white", "cursor": "pointer", "padding": "5px" },
              onClick: _cache[0] || (_cache[0] = ($event) => {
                {
                  showLimited.value = false;
                  const editorState = lastEditorStateRef.value;
                  if (editorState !== null) {
                    lastEditorStateRef.value = null;
                    generateTree(editorState);
                  }
                }
              })
            }, " Show full tree ")
          ])) : _createCommentVNode3("v-if", true),
          !showLimited.value ? (_openBlock4(), _createElementBlock4("div", _hoisted_2, [
            _createElementVNode(
              "button",
              {
                class: _normalizeClass(_ctx.treeTypeButtonClassName),
                type: "button",
                onClick: _cache[1] || (_cache[1] = ($event) => showExportDOM.value = !showExportDOM.value)
              },
              _toDisplayString(showExportDOM.value ? "Tree" : "Export DOM"),
              3
              /* TEXT, CLASS */
            )
          ])) : _createCommentVNode3("v-if", true),
          !timeTravelEnabled.value && (showLimited.value || !isLimited.value) && totalEditorStates.value > 2 ? (_openBlock4(), _createElementBlock4(
            "button",
            {
              key: 2,
              class: _normalizeClass(_ctx.timeTravelButtonClassName),
              onClick: enableTimeTravel
            },
            " Time Travel ",
            2
            /* CLASS */
          )) : _createCommentVNode3("v-if", true),
          showLimited.value || !isLimited.value ? (_openBlock4(), _createElementBlock4(
            "pre",
            {
              key: 3,
              ref_key: "treeElementRef",
              ref: treeElementRef
            },
            _toDisplayString(content.value),
            513
            /* TEXT, NEED_PATCH */
          )) : _createCommentVNode3("v-if", true),
          timeTravelEnabled.value && (showLimited.value || !isLimited.value) ? (_openBlock4(), _createElementBlock4(
            "div",
            {
              key: 4,
              class: _normalizeClass(_ctx.timeTravelPanelClassName)
            },
            [
              _createElementVNode(
                "button",
                {
                  class: _normalizeClass(_ctx.timeTravelPanelButtonClassName),
                  onClick: _cache[2] || (_cache[2] = ($event) => {
                    {
                      if (playingIndexRef.value === totalEditorStates.value - 1) {
                        playingIndexRef.value = 1;
                      }
                      isPlaying.value = !isPlaying.value;
                    }
                  })
                },
                _toDisplayString(isPlaying.value ? "Pause" : "Play"),
                3
                /* TEXT, CLASS */
              ),
              _createElementVNode("input", {
                ref_key: "inputRef",
                ref: inputRef,
                class: _normalizeClass(_ctx.timeTravelPanelSliderClassName),
                type: "range",
                min: "1",
                max: totalEditorStates.value - 1,
                onInput: updateEditorState
              }, null, 42, _hoisted_3),
              _createElementVNode(
                "button",
                {
                  class: _normalizeClass(_ctx.timeTravelPanelButtonClassName),
                  onClick: exit
                },
                " Exit ",
                2
                /* CLASS */
              )
            ],
            2
            /* CLASS */
          )) : _createCommentVNode3("v-if", true)
        ],
        2
        /* CLASS */
      );
    };
  }
});
var LexicalTreeViewPlugin_default = _sfc_main7;

// src/components/LexicalAutoFocusPlugin.vue
import { defineComponent as _defineComponent8 } from "vue";
import { nextTick, onMounted as onMounted3 } from "vue";
var _sfc_main8 = /* @__PURE__ */ _defineComponent8({
  __name: "LexicalAutoFocusPlugin",
  props: {
    defaultSelection: {}
  },
  setup(__props) {
    const props = __props;
    const editor = useLexicalComposer();
    onMounted3(() => {
      nextTick(() => {
        editor.focus(
          () => {
            const activeElement = document.activeElement;
            const rootElement = editor.getRootElement();
            if (rootElement !== null && (activeElement === null || !rootElement.contains(activeElement))) {
              rootElement.focus({ preventScroll: true });
            }
          },
          { defaultSelection: props.defaultSelection }
        );
      });
    });
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalAutoFocusPlugin_default = _sfc_main8;

// src/components/LexicalRichTextPlugin.vue
import { defineComponent as _defineComponent9 } from "vue";
import { renderSlot as _renderSlot4, unref as _unref3, createCommentVNode as _createCommentVNode4, createVNode as _createVNode3, Fragment as _Fragment3, openBlock as _openBlock5, createElementBlock as _createElementBlock5 } from "vue";
var _sfc_main9 = /* @__PURE__ */ _defineComponent9({
  __name: "LexicalRichTextPlugin",
  setup(__props) {
    const editor = useLexicalComposer();
    const showPlaceholder = useCanShowPlaceholder(editor);
    useRichTextSetup(editor);
    return (_ctx, _cache) => {
      return _openBlock5(), _createElementBlock5(
        _Fragment3,
        null,
        [
          _renderSlot4(_ctx.$slots, "contentEditable"),
          _unref3(showPlaceholder) ? _renderSlot4(_ctx.$slots, "placeholder", { key: 0 }) : _createCommentVNode4("v-if", true),
          _createVNode3(_unref3(LexicalDecoratedTeleports_default))
        ],
        64
        /* STABLE_FRAGMENT */
      );
    };
  }
});
var LexicalRichTextPlugin_default = _sfc_main9;

// src/components/LexicalListPlugin.vue
import { defineComponent as _defineComponent10 } from "vue";
import { ListItemNode, ListNode } from "@lexical/list";
import { onMounted as onMounted4 } from "vue";
var _sfc_main10 = /* @__PURE__ */ _defineComponent10({
  __name: "LexicalListPlugin",
  setup(__props) {
    const editor = useLexicalComposer();
    onMounted4(() => {
      if (!editor.hasNodes([ListNode, ListItemNode])) {
        throw new Error(
          "ListPlugin: ListNode and/or ListItemNode not registered on editor"
        );
      }
    });
    useList(editor);
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalListPlugin_default = _sfc_main10;

// src/components/LexicalLinkPlugin.vue
import { defineComponent as _defineComponent11 } from "vue";
import {
  $toggleLink,
  LinkNode,
  TOGGLE_LINK_COMMAND
} from "@lexical/link";
import {
  $getSelection as $getSelection6,
  $isElementNode as $isElementNode3,
  $isRangeSelection as $isRangeSelection3,
  COMMAND_PRIORITY_LOW as COMMAND_PRIORITY_LOW2,
  PASTE_COMMAND
} from "lexical";
import { mergeRegister as mergeRegister10, objectKlassEquals } from "@lexical/utils";
var _sfc_main11 = /* @__PURE__ */ _defineComponent11({
  __name: "LexicalLinkPlugin",
  props: {
    validateUrl: { type: Function },
    attributes: {}
  },
  setup(__props) {
    const editor = useLexicalComposer();
    useEffect(() => {
      if (!editor.hasNodes([LinkNode]))
        throw new Error("LinkPlugin: LinkNode not registered on editor");
      return mergeRegister10(
        editor.registerCommand(
          TOGGLE_LINK_COMMAND,
          (payload) => {
            if (payload === null) {
              $toggleLink(payload);
              return true;
            } else if (typeof payload === "string") {
              if (__props.validateUrl === void 0 || __props.validateUrl(payload)) {
                $toggleLink(payload, __props.attributes);
                return true;
              }
              return false;
            } else {
              const { url, target, rel, title } = payload;
              $toggleLink(url, {
                ...__props.attributes,
                rel,
                target,
                title
              });
              return true;
            }
          },
          COMMAND_PRIORITY_LOW2
        ),
        __props.validateUrl !== void 0 ? editor.registerCommand(
          PASTE_COMMAND,
          (event) => {
            const selection = $getSelection6();
            if (!$isRangeSelection3(selection) || selection.isCollapsed() || !objectKlassEquals(event, ClipboardEvent)) {
              return false;
            }
            const clipboardEvent = event;
            if (clipboardEvent.clipboardData === null)
              return false;
            const clipboardText = clipboardEvent.clipboardData.getData("text");
            if (!__props.validateUrl?.(clipboardText))
              return false;
            if (!selection.getNodes().some((node) => $isElementNode3(node))) {
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, {
                ...__props.attributes,
                url: clipboardText
              });
              event.preventDefault();
              return true;
            }
            return false;
          },
          COMMAND_PRIORITY_LOW2
        ) : () => {
        }
      );
    });
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalLinkPlugin_default = _sfc_main11;

// src/components/LexicalTablePlugin.vue
import { defineComponent as _defineComponent12 } from "vue";
import {
  TableCellNode,
  registerTableCellUnmergeTransform,
  registerTablePlugin,
  registerTableSelectionObserver,
  setScrollableTablesActive
} from "@lexical/table";
var _sfc_main12 = /* @__PURE__ */ _defineComponent12({
  __name: "LexicalTablePlugin",
  props: {
    hasCellMerge: { type: Boolean, default: true },
    hasCellBackgroundColor: { type: Boolean, default: true },
    hasTabHandler: { type: Boolean, default: true },
    hasHorizontalScroll: { type: Boolean, default: false }
  },
  setup(__props) {
    const editor = useLexicalComposer();
    useEffect(() => {
      setScrollableTablesActive(editor, __props.hasHorizontalScroll);
    });
    useMounted(() => {
      return registerTablePlugin(editor);
    });
    useEffect(() => {
      return registerTableSelectionObserver(editor, __props.hasTabHandler);
    });
    useEffect(() => {
      if (!__props.hasCellMerge)
        return registerTableCellUnmergeTransform(editor);
    });
    useEffect(() => {
      if (!__props.hasCellBackgroundColor) {
        return editor.registerNodeTransform(TableCellNode, (node) => {
          if (node.getBackgroundColor() !== null)
            node.setBackgroundColor(null);
        });
      }
    });
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalTablePlugin_default = _sfc_main12;

// src/components/LexicalClearEditorPlugin.vue
import { defineComponent as _defineComponent13 } from "vue";
import {
  $createParagraphNode as $createParagraphNode3,
  $getRoot as $getRoot5,
  $getSelection as $getSelection7,
  $isRangeSelection as $isRangeSelection4,
  CLEAR_EDITOR_COMMAND,
  COMMAND_PRIORITY_EDITOR as COMMAND_PRIORITY_EDITOR2
} from "lexical";
import { useAttrs } from "vue";
var _sfc_main13 = /* @__PURE__ */ _defineComponent13({
  __name: "LexicalClearEditorPlugin",
  emits: ["clear"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const editor = useLexicalComposer();
    const attrs = useAttrs();
    useMounted(() => {
      const emitExists = Boolean(attrs.onClear);
      return editor.registerCommand(
        CLEAR_EDITOR_COMMAND,
        (_payload) => {
          editor.update(() => {
            if (!emitExists) {
              const root = $getRoot5();
              const selection = $getSelection7();
              const paragraph = $createParagraphNode3();
              root.clear();
              root.append(paragraph);
              if (selection !== null)
                paragraph.select();
              if ($isRangeSelection4(selection)) {
                selection.format = 0;
              }
            } else {
              emit("clear");
            }
          });
          return true;
        },
        COMMAND_PRIORITY_EDITOR2
      );
    });
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalClearEditorPlugin_default = _sfc_main13;

// src/components/LexicalCharacterLimitPlugin.vue
import { defineComponent as _defineComponent14 } from "vue";
import { renderSlot as _renderSlot5, toDisplayString as _toDisplayString2, normalizeClass as _normalizeClass2, createElementVNode as _createElementVNode2 } from "vue";
import { computed as computed6, ref as ref10 } from "vue";
var _sfc_main14 = /* @__PURE__ */ _defineComponent14({
  __name: "LexicalCharacterLimitPlugin",
  props: {
    charset: { default: "UTF-16" },
    maxLength: { default: 5 }
  },
  setup(__props) {
    const props = __props;
    const editor = useLexicalComposer();
    let textEncoderInstance = null;
    function textEncoder() {
      if (window.TextEncoder === void 0)
        return null;
      if (textEncoderInstance === null)
        textEncoderInstance = new window.TextEncoder();
      return textEncoderInstance;
    }
    function utf8Length(text) {
      const currentTextEncoder = textEncoder();
      if (currentTextEncoder === null) {
        const m = encodeURIComponent(text).match(/%[89AB]/gi);
        return text.length + (m ? m.length : 0);
      }
      return currentTextEncoder.encode(text).length;
    }
    const remainingCharacters = ref10(props.maxLength);
    function setRemainingCharacters(payload) {
      remainingCharacters.value = payload;
    }
    const characterLimitProps = computed6(
      () => ({
        remainingCharacters: setRemainingCharacters,
        strlen: (text) => {
          if (props.charset === "UTF-8")
            return utf8Length(text);
          else if (props.charset === "UTF-16")
            return text.length;
          else
            throw new Error("Unrecognized charset");
        }
      })
    );
    useCharacterLimit(
      editor,
      () => props.maxLength,
      characterLimitProps
    );
    return (_ctx, _cache) => {
      return _renderSlot5(_ctx.$slots, "default", { remainingCharacters: remainingCharacters.value }, () => [
        _createElementVNode2(
          "span",
          {
            class: _normalizeClass2(`characters-limit ${remainingCharacters.value < 0 ? "characters-limit-exceeded" : ""}`)
          },
          _toDisplayString2(remainingCharacters.value),
          3
          /* TEXT, CLASS */
        )
      ]);
    };
  }
});
var LexicalCharacterLimitPlugin_default = _sfc_main14;

// src/components/LexicalAutoScrollPlugin.vue
import { defineComponent as _defineComponent15 } from "vue";
import { $getSelection as $getSelection8, $isRangeSelection as $isRangeSelection5 } from "lexical";
var _sfc_main15 = /* @__PURE__ */ _defineComponent15({
  __name: "LexicalAutoScrollPlugin",
  props: {
    scrollRef: {}
  },
  setup(__props) {
    const props = __props;
    const editor = useLexicalComposer();
    useMounted(() => {
      return editor.registerUpdateListener(({ tags, editorState }) => {
        const scrollElement = props.scrollRef;
        if (!scrollElement || !tags.has("scroll-into-view"))
          return;
        const selection = editorState.read(() => $getSelection8());
        if (!$isRangeSelection5(selection) || !selection.isCollapsed())
          return;
        const anchorElement = editor.getElementByKey(selection.anchor.key);
        if (anchorElement === null)
          return;
        const scrollRect = scrollElement.getBoundingClientRect();
        const rect = anchorElement.getBoundingClientRect();
        if (rect.bottom > scrollRect.bottom)
          anchorElement.scrollIntoView(false);
        else if (rect.top < scrollRect.top)
          anchorElement.scrollIntoView();
      });
    });
    return () => {
    };
  }
});
var LexicalAutoScrollPlugin_default = _sfc_main15;

// src/components/LexicalHashtagPlugin.vue
import { defineComponent as _defineComponent16 } from "vue";
import { $createHashtagNode, HashtagNode } from "@lexical/hashtag";
import { onMounted as onMounted5 } from "vue";
import invariant3 from "tiny-invariant";
var _sfc_main16 = /* @__PURE__ */ _defineComponent16({
  __name: "LexicalHashtagPlugin",
  setup(__props) {
    function getHashtagRegexStringChars() {
      const latinAccents = "\xC0-\xD6\xD8-\xF6\xF8-\xFF\u0100-\u024F\u0253-\u0254\u0256-\u0257\u0259\u025B\u0263\u0268\u026F\u0272\u0289\u028B\u02BB\u0300-\u036F\u1E00-\u1EFF";
      const nonLatinChars = "\u0400-\u04FF\u0500-\u0527\u2DE0-\u2DFF\uA640-\uA69F\u0591-\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F4\uFB12-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40-\uFB41\uFB43-\uFB44\uFB46-\uFB4F\u0610-\u061A\u0620-\u065F\u066E-\u06D3\u06D5-\u06DC\u06DE-\u06E8\u06EA-\u06EF\u06FA-\u06FC\u06FF\u0750-\u077F\u08A0\u08A2-\u08AC\u08E4-\u08FE\uFB50-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\u200C-\u200C\u0E01-\u0E3A\u0E40-\u0E4E\u1100-\u11FF\u3130-\u3185\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF\uFFA1-\uFFDC";
      const charCode = String.fromCharCode;
      const cjkChars = `\u30A1-\u30FA\u30FC-\u30FE\uFF66-\uFF9F\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\u3041-\u3096\u3099-\u309E\u3400-\u4DBF\u4E00-\u9FFF${// Kanji (Unified)
      // Disabled as it breaks the Regex.
      // charCode(0x20000) + '-' + charCode(0x2A6DF) + // Kanji (CJK Extension B)
      charCode(173824)}-${charCode(177983)}${charCode(177984)}-${charCode(178207)}${charCode(194560)}-${charCode(195103)}\u3003\u3005\u303B`;
      const otherChars = latinAccents + nonLatinChars + cjkChars;
      const unicodeLetters = "A-Za-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u0241\u0250-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EE\u037A\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03CE\u03D0-\u03F5\u03F7-\u0481\u048A-\u04CE\u04D0-\u04F9\u0500-\u050F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0621-\u063A\u0640-\u064A\u066E-\u066F\u0671-\u06D3\u06D5\u06E5-\u06E6\u06EE-\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u076D\u0780-\u07A5\u07B1\u0904-\u0939\u093D\u0950\u0958-\u0961\u097D\u0985-\u098C\u098F-\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC-\u09DD\u09DF-\u09E1\u09F0-\u09F1\u0A05-\u0A0A\u0A0F-\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32-\u0A33\u0A35-\u0A36\u0A38-\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2-\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0-\u0AE1\u0B05-\u0B0C\u0B0F-\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32-\u0B33\u0B35-\u0B39\u0B3D\u0B5C-\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99-\u0B9A\u0B9C\u0B9E-\u0B9F\u0BA3-\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C60-\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0-\u0CE1\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D28\u0D2A-\u0D39\u0D60-\u0D61\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32-\u0E33\u0E40-\u0E46\u0E81-\u0E82\u0E84\u0E87-\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA-\u0EAB\u0EAD-\u0EB0\u0EB2-\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDD\u0F00\u0F40-\u0F47\u0F49-\u0F6A\u0F88-\u0F8B\u1000-\u1021\u1023-\u1027\u1029-\u102A\u1050-\u1055\u10A0-\u10C5\u10D0-\u10FA\u10FC\u1100-\u1159\u115F-\u11A2\u11A8-\u11F9\u1200-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u1676\u1681-\u169A\u16A0-\u16EA\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19A9\u19C1-\u19C7\u1A00-\u1A16\u1D00-\u1DBF\u1E00-\u1E9B\u1EA0-\u1EF9\u1F00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u2094\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2131\u2133-\u2139\u213C-\u213F\u2145-\u2149\u2C00-\u2C2E\u2C30-\u2C5E\u2C80-\u2CE4\u2D00-\u2D25\u2D30-\u2D65\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3005-\u3006\u3031-\u3035\u303B-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312C\u3131-\u318E\u31A0-\u31B7\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FBB\uA000-\uA48C\uA800-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uAC00-\uD7A3\uF900-\uFA2D\uFA30-\uFA6A\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40-\uFB41\uFB43-\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC";
      const unicodeAccents = "\u0300-\u036F\u0483-\u0486\u0591-\u05B9\u05BB-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7\u0610-\u0615\u064B-\u065E\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7-\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u0901-\u0903\u093C\u093E-\u094D\u0951-\u0954\u0962-\u0963\u0981-\u0983\u09BC\u09BE-\u09C4\u09C7-\u09C8\u09CB-\u09CD\u09D7\u09E2-\u09E3\u0A01-\u0A03\u0A3C\u0A3E-\u0A42\u0A47-\u0A48\u0A4B-\u0A4D\u0A70-\u0A71\u0A81-\u0A83\u0ABC\u0ABE-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AE2-\u0AE3\u0B01-\u0B03\u0B3C\u0B3E-\u0B43\u0B47-\u0B48\u0B4B-\u0B4D\u0B56-\u0B57\u0B82\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD7\u0C01-\u0C03\u0C3E-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55-\u0C56\u0C82-\u0C83\u0CBC\u0CBE-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5-\u0CD6\u0D02-\u0D03\u0D3E-\u0D43\u0D46-\u0D48\u0D4A-\u0D4D\u0D57\u0D82-\u0D83\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DF2-\u0DF3\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EB9\u0EBB-\u0EBC\u0EC8-\u0ECD\u0F18-\u0F19\u0F35\u0F37\u0F39\u0F3E-\u0F3F\u0F71-\u0F84\u0F86-\u0F87\u0F90-\u0F97\u0F99-\u0FBC\u0FC6\u102C-\u1032\u1036-\u1039\u1056-\u1059\u135F\u1712-\u1714\u1732-\u1734\u1752-\u1753\u1772-\u1773\u17B6-\u17D3\u17DD\u180B-\u180D\u18A9\u1920-\u192B\u1930-\u193B\u19B0-\u19C0\u19C8-\u19C9\u1A17-\u1A1B\u1DC0-\u1DC3\u20D0-\u20DC\u20E1\u20E5-\u20EB\u302A-\u302F\u3099-\u309A\uA802\uA806\uA80B\uA823-\uA827\uFB1E\uFE00-\uFE0F\uFE20-\uFE23";
      const unicodeDigits = "0-9\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u09E6-\u09EF\u0A66-\u0A6F\u0AE6-\u0AEF\u0B66-\u0B6F\u0BE6-\u0BEF\u0C66-\u0C6F\u0CE6-\u0CEF\u0D66-\u0D6F\u0E50-\u0E59\u0ED0-\u0ED9\u0F20-\u0F29\u1040-\u1049\u17E0-\u17E9\u1810-\u1819\u1946-\u194F\u19D0-\u19D9\uFF10-\uFF19";
      const alpha = unicodeLetters + unicodeAccents + otherChars;
      const numeric = `${unicodeDigits}_`;
      const alphanumeric = alpha + numeric;
      const hashChars = "#\\uFF03";
      return {
        alpha,
        alphanumeric,
        hashChars
      };
    }
    function getHashtagRegexString() {
      const { alpha, alphanumeric, hashChars } = getHashtagRegexStringChars();
      const hashtagAlpha = `[${alpha}]`;
      const hashtagAlphanumeric = `[${alphanumeric}]`;
      const hashtagBoundary = `^|$|[^&/${alphanumeric}]`;
      const hashCharList = `[${hashChars}]`;
      const hashtag = `(${hashtagBoundary})(${hashCharList})(${hashtagAlphanumeric}*${hashtagAlpha}${hashtagAlphanumeric}*)`;
      return hashtag;
    }
    const REGEX = new RegExp(getHashtagRegexString(), "i");
    const editor = useLexicalComposer();
    onMounted5(() => {
      if (!editor.hasNodes([HashtagNode]))
        invariant3(false, "HashtagPlugin: HashtagNode not registered on editor");
    });
    function createHashtagNode(textNode) {
      return $createHashtagNode(textNode.getTextContent());
    }
    function getHashtagMatch(text) {
      const matchArr = REGEX.exec(text);
      if (matchArr === null)
        return null;
      const hashtagLength = matchArr[3].length + 1;
      const startOffset = matchArr.index + matchArr[1].length;
      const endOffset = startOffset + hashtagLength;
      return { end: endOffset, start: startOffset };
    }
    useLexicalTextEntity(getHashtagMatch, HashtagNode, createHashtagNode);
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalHashtagPlugin_default = _sfc_main16;

// src/components/LexicalDecoratorBlockNode.ts
import { DecoratorNode } from "lexical";
var DecoratorBlockNode = class extends DecoratorNode {
  __format;
  constructor(format, key) {
    super(key);
    this.__format = format || "";
  }
  canIndent() {
    return false;
  }
  isInline() {
    return false;
  }
  exportJSON() {
    return {
      ...super.exportJSON(),
      format: this.__format || ""
    };
  }
  updateFromJSON(serializedNode) {
    return super.updateFromJSON(serializedNode).setFormat(serializedNode.format || "");
  }
  setFormat(format) {
    const self = this.getWritable();
    self.__format = format;
    return self;
  }
  createDOM() {
    return document.createElement("div");
  }
  updateDOM() {
    return false;
  }
};
function $createDecoratorBlockNode() {
  return new DecoratorBlockNode();
}
function $isDecoratorBlockNode(node) {
  return node instanceof DecoratorBlockNode;
}

// src/components/LexicalBlockWithAlignableContents.vue
import { defineComponent as _defineComponent17 } from "vue";
import { unref as _unref4, renderSlot as _renderSlot6, normalizeClass as _normalizeClass3, normalizeStyle as _normalizeStyle, openBlock as _openBlock6, createElementBlock as _createElementBlock6 } from "vue";
import {
  $getNearestBlockElementAncestorOrThrow,
  mergeRegister as mergeRegister11
} from "@lexical/utils";
import {
  $getNodeByKey as $getNodeByKey3,
  $getSelection as $getSelection9,
  $isDecoratorNode,
  $isNodeSelection as $isNodeSelection3,
  $isRangeSelection as $isRangeSelection6,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW as COMMAND_PRIORITY_LOW3,
  FORMAT_ELEMENT_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND
} from "lexical";
import { ref as ref11 } from "vue";
var _sfc_main17 = /* @__PURE__ */ _defineComponent17({
  __name: "LexicalBlockWithAlignableContents",
  props: {
    format: {},
    nodeKey: {},
    baseClass: {},
    focusClass: {}
  },
  setup(__props) {
    const props = __props;
    const editor = useLexicalComposer();
    const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(props.nodeKey);
    const containerRef = ref11(null);
    function $onDelete(event) {
      const deleteSelection = $getSelection9();
      if (isSelected.value && $isNodeSelection3(deleteSelection)) {
        event.preventDefault();
        deleteSelection.getNodes().forEach((node) => {
          if ($isDecoratorNode(node)) {
            node.remove();
          }
        });
      }
      return false;
    }
    useMounted(() => {
      return mergeRegister11(
        editor.registerCommand(
          FORMAT_ELEMENT_COMMAND,
          (formatType) => {
            if (isSelected.value) {
              const selection = $getSelection9();
              if ($isNodeSelection3(selection)) {
                const node = $getNodeByKey3(props.nodeKey);
                if (node && $isDecoratorBlockNode(node))
                  node.setFormat(formatType);
              } else if ($isRangeSelection6(selection)) {
                const nodes = selection.getNodes();
                for (const node of nodes) {
                  if ($isDecoratorBlockNode(node)) {
                    node.setFormat(formatType);
                  } else {
                    const element = $getNearestBlockElementAncestorOrThrow(node);
                    element.setFormat(formatType);
                  }
                }
              }
              return true;
            }
            return false;
          },
          COMMAND_PRIORITY_LOW3
        ),
        editor.registerCommand(
          CLICK_COMMAND,
          (event) => {
            if (event.target === containerRef.value) {
              event.preventDefault();
              if (!event.shiftKey)
                clearSelection();
              setSelected(!isSelected.value);
              return true;
            }
            return false;
          },
          COMMAND_PRIORITY_LOW3
        ),
        editor.registerCommand(
          KEY_DELETE_COMMAND,
          $onDelete,
          COMMAND_PRIORITY_LOW3
        ),
        editor.registerCommand(
          KEY_BACKSPACE_COMMAND,
          $onDelete,
          COMMAND_PRIORITY_LOW3
        )
      );
    });
    return (_ctx, _cache) => {
      return _openBlock6(), _createElementBlock6(
        "div",
        {
          ref_key: "containerRef",
          ref: containerRef,
          style: _normalizeStyle(`text-align: ${_ctx.format}`),
          class: _normalizeClass3([_ctx.baseClass, _unref4(isSelected) ? _ctx.focusClass : ""])
        },
        [
          _renderSlot6(_ctx.$slots, "default")
        ],
        6
        /* CLASS, STYLE */
      );
    };
  }
});
var LexicalBlockWithAlignableContents_default = _sfc_main17;

// src/components/LexicalCheckListPlugin.vue
import { defineComponent as _defineComponent18 } from "vue";
import {
  $getNearestNodeFromDOMNode,
  $getSelection as $getSelection10,
  $isElementNode as $isElementNode4,
  $isRangeSelection as $isRangeSelection7,
  COMMAND_PRIORITY_LOW as COMMAND_PRIORITY_LOW4,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_SPACE_COMMAND,
  getNearestEditorFromDOMNode
} from "lexical";
import {
  $isListItemNode,
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
  insertList as insertList2
} from "@lexical/list";
import { $findMatchingParent, calculateZoomLevel, mergeRegister as mergeRegister12 } from "@lexical/utils";
var _sfc_main18 = /* @__PURE__ */ _defineComponent18({
  __name: "LexicalCheckListPlugin",
  setup(__props) {
    const editor = useLexicalComposer();
    useMounted(() => {
      return mergeRegister12(
        editor.registerCommand(
          INSERT_CHECK_LIST_COMMAND,
          () => {
            insertList2(editor, "check");
            return true;
          },
          COMMAND_PRIORITY_LOW4
        ),
        editor.registerCommand(
          KEY_ARROW_DOWN_COMMAND,
          (event) => {
            return handleArrownUpOrDown(event, editor, false);
          },
          COMMAND_PRIORITY_LOW4
        ),
        editor.registerCommand(
          KEY_ARROW_UP_COMMAND,
          (event) => {
            return handleArrownUpOrDown(event, editor, true);
          },
          COMMAND_PRIORITY_LOW4
        ),
        editor.registerCommand(
          KEY_ESCAPE_COMMAND,
          (_event) => {
            const activeItem = getActiveCheckListItem();
            if (activeItem != null) {
              const rootElement = editor.getRootElement();
              if (rootElement != null)
                rootElement.focus();
              return true;
            }
            return false;
          },
          COMMAND_PRIORITY_LOW4
        ),
        editor.registerCommand(
          KEY_SPACE_COMMAND,
          (event) => {
            const activeItem = getActiveCheckListItem();
            if (activeItem != null) {
              editor.update(() => {
                const listItemNode = $getNearestNodeFromDOMNode(activeItem);
                if ($isListItemNode(listItemNode)) {
                  event.preventDefault();
                  listItemNode.toggleChecked();
                }
              });
              return true;
            }
            return false;
          },
          COMMAND_PRIORITY_LOW4
        ),
        editor.registerCommand(
          KEY_ARROW_LEFT_COMMAND,
          (event) => {
            return editor.getEditorState().read(() => {
              const selection = $getSelection10();
              if ($isRangeSelection7(selection) && selection.isCollapsed()) {
                const { anchor } = selection;
                const isElement = anchor.type === "element";
                if (isElement || anchor.offset === 0) {
                  const anchorNode = anchor.getNode();
                  const elementNode = $findMatchingParent(
                    anchorNode,
                    (node) => $isElementNode4(node) && !node.isInline()
                  );
                  if ($isListItemNode(elementNode)) {
                    const parent = elementNode.getParent();
                    if ($isListNode(parent) && parent.getListType() === "check" && (isElement || elementNode.getFirstDescendant() === anchorNode)) {
                      const domNode = editor.getElementByKey(elementNode.__key);
                      if (domNode != null && document.activeElement !== domNode) {
                        domNode.focus();
                        event.preventDefault();
                        return true;
                      }
                    }
                  }
                }
              }
              return false;
            });
          },
          COMMAND_PRIORITY_LOW4
        ),
        editor.registerRootListener((rootElement, prevRootElement) => {
          if (rootElement !== null) {
            rootElement.addEventListener("click", handleClick);
            rootElement.addEventListener("pointerdown", handlePointerDown);
          }
          if (prevRootElement !== null) {
            prevRootElement.removeEventListener("click", handleClick);
            prevRootElement.removeEventListener("pointerdown", handlePointerDown);
          }
        })
      );
    });
    function handleCheckItemEvent(event, callback) {
      const target = event.target;
      if (!(target instanceof HTMLElement))
        return;
      const firstChild = target.firstChild;
      if (firstChild != null && (firstChild.tagName === "UL" || firstChild.tagName === "OL")) {
        return;
      }
      const parentNode = target.parentNode;
      if (!parentNode || parentNode.__lexicalListType !== "check")
        return;
      const pageX = event.pageX / calculateZoomLevel(target);
      const rect = target.getBoundingClientRect();
      if (target.dir === "rtl" ? pageX < rect.right && pageX > rect.right - 20 : pageX > rect.left && pageX < rect.left + 20) {
        callback();
      }
    }
    function handleClick(event) {
      handleCheckItemEvent(event, () => {
        const domNode = event.target;
        const editor2 = getNearestEditorFromDOMNode(domNode);
        if (editor2 !== null && editor2.isEditable()) {
          editor2.update(() => {
            const node = $getNearestNodeFromDOMNode(domNode);
            if ($isListItemNode(node)) {
              domNode.focus();
              node.toggleChecked();
            }
          });
        }
      });
    }
    function handlePointerDown(event) {
      handleCheckItemEvent(event, () => {
        event.preventDefault();
      });
    }
    function getActiveCheckListItem() {
      const activeElement = document.activeElement;
      return activeElement instanceof HTMLElement && activeElement.tagName === "LI" && activeElement.parentNode != null && activeElement.parentNode.__lexicalListType === "check" ? activeElement : null;
    }
    function findCheckListItemSibling(node, backward) {
      let sibling = backward ? node.getPreviousSibling() : node.getNextSibling();
      let parent = node;
      while (sibling == null && $isListItemNode(parent)) {
        parent = parent.getParentOrThrow().getParent();
        if (parent !== null) {
          sibling = backward ? parent.getPreviousSibling() : parent.getNextSibling();
        }
      }
      while ($isListItemNode(sibling)) {
        const firstChild = backward ? sibling.getLastChild() : sibling.getFirstChild();
        if (!$isListNode(firstChild))
          return sibling;
        sibling = backward ? firstChild.getLastChild() : firstChild.getFirstChild();
      }
      return null;
    }
    function handleArrownUpOrDown(event, editor2, backward) {
      const activeItem = getActiveCheckListItem();
      if (activeItem != null) {
        editor2.update(() => {
          const listItem = $getNearestNodeFromDOMNode(activeItem);
          if (!$isListItemNode(listItem))
            return;
          const nextListItem = findCheckListItemSibling(listItem, backward);
          if (nextListItem != null) {
            nextListItem.selectStart();
            const dom = editor2.getElementByKey(nextListItem.__key);
            if (dom != null) {
              event.preventDefault();
              setTimeout(() => {
                dom.focus();
              }, 0);
            }
          }
        });
      }
      return false;
    }
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalCheckListPlugin_default = _sfc_main18;

// src/components/LexicalMarkdownShortcutPlugin/index.vue
import { defineComponent as _defineComponent19 } from "vue";
import { TRANSFORMERS, registerMarkdownShortcuts } from "@lexical/markdown";

// src/components/LexicalHorizontalRuleNode.ts
import {
  addClassNamesToElement,
  mergeRegister as mergeRegister13,
  removeClassNamesFromElement
} from "@lexical/utils";
import {
  $applyNodeReplacement,
  $getSelection as $getSelection11,
  $isNodeSelection as $isNodeSelection4,
  CLICK_COMMAND as CLICK_COMMAND2,
  COMMAND_PRIORITY_LOW as COMMAND_PRIORITY_LOW5,
  DecoratorNode as DecoratorNode2,
  KEY_BACKSPACE_COMMAND as KEY_BACKSPACE_COMMAND2,
  KEY_DELETE_COMMAND as KEY_DELETE_COMMAND2,
  createCommand
} from "lexical";
import { defineComponent as defineComponent2, h as h2 } from "vue";
var INSERT_HORIZONTAL_RULE_COMMAND = createCommand("INSERT_HORIZONTAL_RULE_COMMAND");
var HorizontalRuleComponent = defineComponent2({
  name: "HorizontalRuleComponent",
  props: {
    nodeKey: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const editor = useLexicalComposer();
    const { isSelected, setSelected, clearSelection } = useLexicalNodeSelection(() => props.nodeKey);
    const $onDelete = (event) => {
      const deleteSelection = $getSelection11();
      if (isSelected.value && $isNodeSelection4(deleteSelection)) {
        event.preventDefault();
        deleteSelection.getNodes().forEach((node) => {
          if ($isHorizontalRuleNode(node)) {
            node.remove();
          }
        });
      }
      return false;
    };
    useEffect(() => {
      return mergeRegister13(
        editor.registerCommand(
          CLICK_COMMAND2,
          (event) => {
            const hrElem = editor.getElementByKey(props.nodeKey);
            if (event.target === hrElem) {
              if (!event.shiftKey) {
                clearSelection();
              }
              setSelected(!isSelected.value);
              return true;
            }
            return false;
          },
          COMMAND_PRIORITY_LOW5
        ),
        editor.registerCommand(
          KEY_DELETE_COMMAND2,
          $onDelete,
          COMMAND_PRIORITY_LOW5
        ),
        editor.registerCommand(
          KEY_BACKSPACE_COMMAND2,
          $onDelete,
          COMMAND_PRIORITY_LOW5
        )
      );
    });
    useEffect(() => {
      const hrElem = editor.getElementByKey(props.nodeKey);
      const isSelectedClassName = editor._config.theme.hrSelected ?? "selected";
      if (hrElem !== null) {
        if (isSelected.value) {
          addClassNamesToElement(hrElem, isSelectedClassName);
        } else {
          removeClassNamesFromElement(hrElem, isSelectedClassName);
        }
      }
    });
  }
});
var HorizontalRuleNode = class _HorizontalRuleNode extends DecoratorNode2 {
  static getType() {
    return "horizontalrule";
  }
  static clone(node) {
    return new _HorizontalRuleNode(node.__key);
  }
  static importJSON(serializedNode) {
    return $createHorizontalRuleNode().updateFromJSON(serializedNode);
  }
  static importDOM() {
    return {
      hr: () => ({
        conversion: $convertHorizontalRuleElement,
        priority: 0
      })
    };
  }
  exportDOM() {
    return { element: document.createElement("hr") };
  }
  createDOM(config) {
    const element = document.createElement("hr");
    addClassNamesToElement(element, config.theme.hr);
    return element;
  }
  getTextContent() {
    return "\n";
  }
  isInline() {
    return false;
  }
  updateDOM() {
    return false;
  }
  decorate() {
    return h2(HorizontalRuleComponent, { nodeKey: this.__key });
  }
};
function $convertHorizontalRuleElement() {
  return { node: $createHorizontalRuleNode() };
}
function $createHorizontalRuleNode() {
  return $applyNodeReplacement(new HorizontalRuleNode());
}
function $isHorizontalRuleNode(node) {
  return node instanceof HorizontalRuleNode;
}

// src/components/LexicalMarkdownShortcutPlugin/shared.ts
var HR = {
  dependencies: [HorizontalRuleNode],
  export: (node) => {
    return $isHorizontalRuleNode(node) ? "***" : null;
  },
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parentNode, _1, _2, isImport) => {
    const line = $createHorizontalRuleNode();
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(line);
    } else {
      parentNode.insertBefore(line);
    }
    line.selectNext();
  },
  type: "element"
};

// src/components/LexicalMarkdownShortcutPlugin/index.vue
var _sfc_main19 = /* @__PURE__ */ _defineComponent19({
  __name: "index",
  props: {
    transformers: { default: () => [HR, ...TRANSFORMERS] }
  },
  setup(__props) {
    const props = __props;
    const editor = useLexicalComposer();
    useMounted(() => {
      return registerMarkdownShortcuts(editor, props.transformers);
    });
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalMarkdownShortcutPlugin_default = _sfc_main19;

// src/components/LexicalTabIndentationPlugin.vue
import { defineComponent as _defineComponent20 } from "vue";
import {
  $createRangeSelection,
  $getSelection as $getSelection12,
  $isBlockElementNode,
  $isRangeSelection as $isRangeSelection8,
  $normalizeSelection__EXPERIMENTAL,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR as COMMAND_PRIORITY_EDITOR3,
  INDENT_CONTENT_COMMAND,
  INSERT_TAB_COMMAND,
  KEY_TAB_COMMAND,
  OUTDENT_CONTENT_COMMAND
} from "lexical";
import { $filter, $getNearestBlockElementAncestorOrThrow as $getNearestBlockElementAncestorOrThrow2, mergeRegister as mergeRegister14 } from "@lexical/utils";
var _sfc_main20 = /* @__PURE__ */ _defineComponent20({
  __name: "LexicalTabIndentationPlugin",
  props: {
    maxIndent: {}
  },
  setup(__props) {
    const props = __props;
    const editor = useLexicalComposer();
    function $indentOverTab(selection) {
      const nodes = selection.getNodes();
      const canIndentBlockNodes = $filter(nodes, (node) => {
        if ($isBlockElementNode(node) && node.canIndent())
          return node;
        return null;
      });
      if (canIndentBlockNodes.length > 0)
        return true;
      const anchor = selection.anchor;
      const focus = selection.focus;
      const first = focus.isBefore(anchor) ? focus : anchor;
      const firstNode = first.getNode();
      const firstBlock = $getNearestBlockElementAncestorOrThrow2(firstNode);
      if (firstBlock.canIndent()) {
        const firstBlockKey = firstBlock.getKey();
        let selectionAtStart = $createRangeSelection();
        selectionAtStart.anchor.set(firstBlockKey, 0, "element");
        selectionAtStart.focus.set(firstBlockKey, 0, "element");
        selectionAtStart = $normalizeSelection__EXPERIMENTAL(selectionAtStart);
        if (selectionAtStart.anchor.is(first))
          return true;
      }
      return false;
    }
    function registerTabIndentation(editor2, maxIndent) {
      return mergeRegister14(
        editor2.registerCommand(
          KEY_TAB_COMMAND,
          (event) => {
            const selection = $getSelection12();
            if (!$isRangeSelection8(selection)) {
              return false;
            }
            event.preventDefault();
            const command = $indentOverTab(selection) ? event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND : INSERT_TAB_COMMAND;
            return editor2.dispatchCommand(command, void 0);
          },
          COMMAND_PRIORITY_EDITOR3
        ),
        editor2.registerCommand(
          INDENT_CONTENT_COMMAND,
          () => {
            if (maxIndent == null) {
              return false;
            }
            const selection = $getSelection12();
            if (!$isRangeSelection8(selection)) {
              return false;
            }
            const indents = selection.getNodes().map(
              (node) => $getNearestBlockElementAncestorOrThrow2(node).getIndent()
            );
            return Math.max(...indents) + 1 >= maxIndent;
          },
          COMMAND_PRIORITY_CRITICAL
        )
      );
    }
    useMounted(() => {
      return registerTabIndentation(editor, props.maxIndent);
    });
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalTabIndentationPlugin_default = _sfc_main20;

// src/components/LexicalCollaborationPlugin.vue
import { defineComponent as _defineComponent21 } from "vue";
import { unref as _unref5, createElementVNode as _createElementVNode3, Teleport as _Teleport, openBlock as _openBlock7, createBlock as _createBlock } from "vue";
import { computed as computed7, watchEffect as watchEffect7 } from "vue";

// src/composables/useCollaborationContext.ts
import { ref as ref12 } from "vue";
var entries = [
  ["Cat", "rgb(125, 50, 0)"],
  ["Dog", "rgb(100, 0, 0)"],
  ["Rabbit", "rgb(150, 0, 0)"],
  ["Frog", "rgb(200, 0, 0)"],
  ["Fox", "rgb(200, 75, 0)"],
  ["Hedgehog", "rgb(0, 75, 0)"],
  ["Pigeon", "rgb(0, 125, 0)"],
  ["Squirrel", "rgb(75, 100, 0)"],
  ["Bear", "rgb(125, 100, 0)"],
  ["Tiger", "rgb(0, 0, 150)"],
  ["Leopard", "rgb(0, 0, 200)"],
  ["Zebra", "rgb(0, 0, 250)"],
  ["Wolf", "rgb(0, 100, 150)"],
  ["Owl", "rgb(0, 100, 100)"],
  ["Gull", "rgb(100, 0, 100)"],
  ["Squid", "rgb(150, 0, 150)"]
];
var randomEntry = entries[Math.floor(Math.random() * entries.length)];
var useCollaborationContext_default = ref12({
  clientID: 0,
  color: randomEntry[1],
  isCollabActive: false,
  name: randomEntry[0],
  yjsDocMap: /* @__PURE__ */ new Map()
});

// src/components/LexicalCollaborationPlugin.vue
var _sfc_main21 = /* @__PURE__ */ _defineComponent21({
  __name: "LexicalCollaborationPlugin",
  props: {
    id: {},
    providerFactory: { type: Function },
    shouldBootstrap: { type: Boolean },
    username: {},
    cursorColor: {},
    cursorsContainerRef: {},
    initialEditorState: { type: [null, String, Object, Function] },
    excludedProperties: {},
    awarenessData: {}
  },
  setup(__props) {
    const props = __props;
    watchEffect7(() => {
      if (props.username !== void 0)
        useCollaborationContext_default.value.name = props.username;
      if (props.cursorColor !== void 0)
        useCollaborationContext_default.value.color = props.cursorColor;
    });
    const editor = useLexicalComposer();
    useEffect(() => {
      useCollaborationContext_default.value.isCollabActive = true;
      return () => {
        if (editor._parentEditor == null)
          useCollaborationContext_default.value.isCollabActive = false;
      };
    });
    const provider = computed7(() => props.providerFactory(props.id, useCollaborationContext_default.value.yjsDocMap));
    const binding = useYjsCollaboration(
      editor,
      props.id,
      provider.value,
      useCollaborationContext_default.value.yjsDocMap,
      useCollaborationContext_default.value.name,
      useCollaborationContext_default.value.color,
      props.shouldBootstrap,
      props.initialEditorState,
      props.excludedProperties,
      props.awarenessData
    );
    watchEffect7(() => {
      useCollaborationContext_default.value.clientID = binding.value.clientID;
    });
    useYjsHistory(editor, binding.value);
    useYjsFocusTracking(
      editor,
      provider.value,
      useCollaborationContext_default.value.name,
      useCollaborationContext_default.value.color,
      props.awarenessData
    );
    return (_ctx, _cache) => {
      return _openBlock7(), _createBlock(_Teleport, {
        to: _ctx.cursorsContainerRef || "body"
      }, [
        _createElementVNode3(
          "div",
          {
            ref: (element) => _unref5(binding).cursorsContainer = element
          },
          null,
          512
          /* NEED_PATCH */
        )
      ], 8, ["to"]);
    };
  }
});
var LexicalCollaborationPlugin_default = _sfc_main21;

// src/components/LexicalClickableLinkPlugin.vue
import { defineComponent as _defineComponent22 } from "vue";
import { $isLinkNode as $isLinkNode2 } from "@lexical/link";
import { $findMatchingParent as $findMatchingParent2, isHTMLAnchorElement } from "@lexical/utils";
import {
  $getNearestNodeFromDOMNode as $getNearestNodeFromDOMNode2,
  $getSelection as $getSelection13,
  $isElementNode as $isElementNode5,
  $isRangeSelection as $isRangeSelection9,
  getNearestEditorFromDOMNode as getNearestEditorFromDOMNode2,
  isDOMNode
} from "lexical";
var _sfc_main22 = /* @__PURE__ */ _defineComponent22({
  __name: "LexicalClickableLinkPlugin",
  props: {
    newTab: { type: Boolean, default: true },
    disabled: { type: Boolean, default: false }
  },
  setup(__props) {
    const props = __props;
    function findMatchingDOM(startNode, predicate) {
      let node = startNode;
      while (node != null) {
        if (predicate(node))
          return node;
        node = node.parentNode;
      }
      return null;
    }
    const editor = useLexicalComposer();
    useMounted(() => {
      const onClick = (event) => {
        const target = event.target;
        if (!isDOMNode(target))
          return;
        const nearestEditor = getNearestEditorFromDOMNode2(target);
        if (nearestEditor === null)
          return;
        let url = null;
        let urlTarget = null;
        nearestEditor.update(() => {
          const clickedNode = $getNearestNodeFromDOMNode2(target);
          if (clickedNode !== null) {
            const maybeLinkNode = $findMatchingParent2(
              clickedNode,
              $isElementNode5
            );
            if (!props.disabled) {
              if ($isLinkNode2(maybeLinkNode)) {
                url = maybeLinkNode.sanitizeUrl(maybeLinkNode.getURL());
                urlTarget = maybeLinkNode.getTarget();
              } else {
                const a = findMatchingDOM(target, isHTMLAnchorElement);
                if (a !== null) {
                  url = a.href;
                  urlTarget = a.target;
                }
              }
            }
          }
        });
        if (url === null || url === "")
          return;
        const selection = editor.getEditorState().read($getSelection13);
        if ($isRangeSelection9(selection) && !selection.isCollapsed()) {
          event.preventDefault();
          return;
        }
        const isMiddle = event.type === "auxclick" && event.button === 1;
        window.open(
          url,
          props.newTab || isMiddle || event.metaKey || event.ctrlKey || urlTarget === "_blank" ? "_blank" : "_self"
        );
        event.preventDefault();
      };
      const onMouseUp = (event) => {
        if (event.button === 1)
          onClick(event);
      };
      return editor.registerRootListener((rootElement, prevRootElement) => {
        if (prevRootElement !== null) {
          prevRootElement.removeEventListener("click", onClick);
          prevRootElement.removeEventListener("mouseup", onMouseUp);
        }
        if (rootElement !== null) {
          rootElement.addEventListener("click", onClick);
          rootElement.addEventListener("mouseup", onMouseUp);
        }
      });
    });
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalClickableLinkPlugin_default = _sfc_main22;

// src/components/LexicalContextMenuPlugin.vue
import { defineComponent as _defineComponent24 } from "vue";
import { unref as _unref6, normalizeProps as _normalizeProps, guardReactiveProps as _guardReactiveProps, renderSlot as _renderSlot8, withCtx as _withCtx, openBlock as _openBlock8, createBlock as _createBlock2, createCommentVNode as _createCommentVNode5 } from "vue";
import { isDOMNode as isDOMNode2 } from "lexical";
import { onMounted as onMounted6, onUnmounted as onUnmounted3, ref as ref15 } from "vue";
import { calculateZoomLevel as calculateZoomLevel2 } from "@lexical/utils";

// src/components/LexicalMenu/shared.ts
import {
  createCommand as createCommand2
} from "lexical";
import { ref as ref13, watchEffect as watchEffect8 } from "vue";
var MenuOption2 = class {
  key;
  ref;
  constructor(key) {
    this.key = key;
    this.ref = null;
    this.setRefElement = this.setRefElement.bind(this);
  }
  setRefElement(el) {
    this.ref = el;
  }
};
function getScrollParent(element, includeHidden) {
  let style = getComputedStyle(element);
  const excludeStaticParent = style.position === "absolute";
  const overflowRegex = includeHidden ? /(auto|scroll|hidden)/ : /(auto|scroll)/;
  if (style.position === "fixed")
    return document.body;
  for (
    let parent = element;
    // eslint-disable-next-line no-cond-assign
    parent = parent.parentElement;
  ) {
    style = getComputedStyle(parent);
    if (excludeStaticParent && style.position === "static")
      continue;
    if (overflowRegex.test(style.overflow + style.overflowY + style.overflowX))
      return parent;
  }
  return document.body;
}
function isTriggerVisibleInNearestScrollContainer(targetElement, containerElement) {
  const tRect = targetElement.getBoundingClientRect();
  const cRect = containerElement.getBoundingClientRect();
  return tRect.top > cRect.top && tRect.top < cRect.bottom;
}
function useDynamicPositioning(resolution, targetElement, onReposition, onVisibilityChange) {
  const editor = useLexicalComposer();
  watchEffect8((onInvalidate) => {
    if (targetElement.value != null && resolution.value != null) {
      const rootElement = editor.getRootElement();
      const rootScrollParent = rootElement != null ? getScrollParent(rootElement, false) : document.body;
      let ticking = false;
      let previousIsInView = isTriggerVisibleInNearestScrollContainer(
        targetElement.value,
        rootScrollParent
      );
      const handleScroll = function() {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            onReposition();
            ticking = false;
          });
          ticking = true;
        }
        const isInView = isTriggerVisibleInNearestScrollContainer(
          targetElement.value,
          rootScrollParent
        );
        if (isInView !== previousIsInView) {
          previousIsInView = isInView;
          if (onVisibilityChange != null)
            onVisibilityChange(isInView);
        }
      };
      const resizeObserver = new ResizeObserver(onReposition);
      window.addEventListener("resize", onReposition);
      document.addEventListener("scroll", handleScroll, {
        capture: true,
        passive: true
      });
      resizeObserver.observe(targetElement.value);
      onInvalidate(() => {
        resizeObserver.unobserve(targetElement.value);
        window.removeEventListener("resize", onReposition);
        document.removeEventListener("scroll", handleScroll, true);
      });
    }
  });
}
var SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND = createCommand2("SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND");
function setContainerDivAttributes(containerDiv, className) {
  if (className != null) {
    containerDiv.className = className;
  }
  containerDiv.setAttribute("aria-label", "Typeahead menu");
  containerDiv.setAttribute("role", "listbox");
  containerDiv.style.display = "block";
  containerDiv.style.position = "absolute";
}
function useMenuAnchorRef(resolution, setResolution, className, parent = document.body, shouldIncludePageYOffset__EXPERIMENTAL = true) {
  const editor = useLexicalComposer();
  const anchorElementRef = ref13(document.createElement("div"));
  const positionMenu = () => {
    anchorElementRef.value.style.top = anchorElementRef.value.style.bottom;
    const rootElement = editor.getRootElement();
    const containerDiv2 = anchorElementRef.value;
    const menuEle = containerDiv2.firstElementChild;
    if (rootElement !== null && resolution.value !== null) {
      const { left, top, width, height } = resolution.value.getRect();
      const anchorHeight = anchorElementRef.value.offsetHeight;
      containerDiv2.style.top = `${top + (shouldIncludePageYOffset__EXPERIMENTAL ? window.pageYOffset : 0) + anchorHeight + 3}px`;
      containerDiv2.style.left = `${left + window.pageXOffset}px`;
      containerDiv2.style.height = `${height}px`;
      containerDiv2.style.width = `${width}px`;
      if (menuEle !== null) {
        menuEle.style.top = `${top}`;
        const menuRect = menuEle.getBoundingClientRect();
        const menuHeight = menuRect.height;
        const menuWidth = menuRect.width;
        const rootElementRect = rootElement.getBoundingClientRect();
        if (left + menuWidth > rootElementRect.right) {
          containerDiv2.style.left = `${rootElementRect.right - menuWidth + window.pageXOffset}px`;
        }
        if ((top + menuHeight > window.innerHeight || top + menuHeight > rootElementRect.bottom) && top - rootElementRect.top > menuHeight + height) {
          containerDiv2.style.top = `${top - menuHeight + (shouldIncludePageYOffset__EXPERIMENTAL ? window.pageYOffset : 0) - height}px`;
        }
      }
      if (!containerDiv2.isConnected) {
        setContainerDivAttributes(containerDiv2, className);
        parent.append(containerDiv2);
      }
      containerDiv2.setAttribute("id", "typeahead-menu");
      anchorElementRef.value = containerDiv2;
      rootElement.setAttribute("aria-controls", "typeahead-menu");
    }
  };
  watchEffect8((onInvalidate) => {
    const rootElement = editor.getRootElement();
    if (resolution.value !== null) {
      positionMenu();
    }
    onInvalidate(() => {
      if (rootElement !== null)
        rootElement.removeAttribute("aria-controls");
      const containerDiv2 = anchorElementRef.value;
      if (containerDiv2 !== null && containerDiv2.isConnected) {
        containerDiv2.remove();
        containerDiv2.removeAttribute("id");
      }
    });
  });
  const onVisibilityChange = (isInView) => {
    if (resolution.value !== null) {
      if (!isInView)
        setResolution(null);
    }
  };
  useDynamicPositioning(
    resolution,
    anchorElementRef,
    positionMenu,
    onVisibilityChange
  );
  const containerDiv = anchorElementRef.value;
  if (containerDiv != null) {
    setContainerDivAttributes(containerDiv, className);
    if (parent != null) {
      parent.append(containerDiv);
    }
  }
  return anchorElementRef;
}

// src/components/LexicalMenu/index.vue
import { defineComponent as _defineComponent23 } from "vue";
import { renderSlot as _renderSlot7 } from "vue";
import { computed as computed8, onUnmounted as onUnmounted2, ref as ref14, watch, watchEffect as watchEffect9 } from "vue";
import { $getSelection as $getSelection14, $isRangeSelection as $isRangeSelection10, KEY_ARROW_DOWN_COMMAND as KEY_ARROW_DOWN_COMMAND2, KEY_ARROW_UP_COMMAND as KEY_ARROW_UP_COMMAND2, KEY_ENTER_COMMAND, KEY_ESCAPE_COMMAND as KEY_ESCAPE_COMMAND2, KEY_TAB_COMMAND as KEY_TAB_COMMAND2 } from "lexical";
import { mergeRegister as mergeRegister15 } from "@lexical/utils";
var _sfc_main23 = /* @__PURE__ */ _defineComponent23({
  __name: "index",
  props: {
    close: { type: Function },
    editor: {},
    anchorElementRef: {},
    resolution: {},
    options: {},
    shouldSplitNodeWithQuery: { type: Boolean },
    commandPriority: {}
  },
  emits: ["selectOption"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const selectedIndex = ref14(null);
    const matchString = computed8(() => props.resolution.match && props.resolution.match.matchingString);
    function setHighlightedIndex(index) {
      selectedIndex.value = index;
    }
    function getFullMatchOffset(documentText, entryText, offset) {
      let triggerOffset = offset;
      for (let i = triggerOffset; i <= entryText.length; i++) {
        if (documentText.substring(-i) === entryText.substring(0, i))
          triggerOffset = i;
      }
      return triggerOffset;
    }
    function $splitNodeContainingQuery(match) {
      const selection = $getSelection14();
      if (!$isRangeSelection10(selection) || !selection.isCollapsed())
        return null;
      const anchor = selection.anchor;
      if (anchor.type !== "text")
        return null;
      const anchorNode = anchor.getNode();
      if (!anchorNode.isSimpleText())
        return null;
      const selectionOffset = anchor.offset;
      const textContent = anchorNode.getTextContent().slice(0, selectionOffset);
      const characterOffset = match.replaceableString.length;
      const queryOffset = getFullMatchOffset(
        textContent,
        match.matchingString,
        characterOffset
      );
      const startOffset = selectionOffset - queryOffset;
      if (startOffset < 0)
        return null;
      let newNode;
      if (startOffset === 0)
        [newNode] = anchorNode.splitText(selectionOffset);
      else
        [, newNode] = anchorNode.splitText(startOffset, selectionOffset);
      return newNode;
    }
    watch(matchString, () => {
      setHighlightedIndex(0);
    }, { immediate: true });
    function selectOptionAndCleanUp(selectedEntry) {
      props.editor.update(() => {
        const textNodeContainingQuery = props.resolution.match != null && props.shouldSplitNodeWithQuery ? $splitNodeContainingQuery(props.resolution.match) : null;
        emit("selectOption", {
          option: selectedEntry,
          textNodeContainingQuery,
          closeMenu: props.close,
          matchingString: props.resolution.match ? props.resolution.match.matchingString : ""
        });
      });
    }
    function updateSelectedIndex(index) {
      const rootElem = props.editor.getRootElement();
      if (rootElem !== null) {
        rootElem.setAttribute(
          "aria-activedescendant",
          `typeahead-item-${index}`
        );
        setHighlightedIndex(index);
      }
    }
    onUnmounted2(() => {
      const rootElem = props.editor.getRootElement();
      if (rootElem !== null)
        rootElem.removeAttribute("aria-activedescendant");
    });
    watchEffect9(() => {
      if (props.options === null)
        setHighlightedIndex(null);
      else if (selectedIndex.value === null)
        updateSelectedIndex(0);
    });
    function scrollIntoViewIfNeeded(target) {
      const typeaheadContainerNode = document.getElementById("typeahead-menu");
      if (!typeaheadContainerNode)
        return;
      const typeaheadRect = typeaheadContainerNode.getBoundingClientRect();
      if (typeaheadRect.top + typeaheadRect.height > window.innerHeight) {
        typeaheadContainerNode.scrollIntoView({
          block: "center"
        });
      }
      if (typeaheadRect.top < 0) {
        typeaheadContainerNode.scrollIntoView({
          block: "center"
        });
      }
      target.scrollIntoView({ block: "nearest" });
    }
    watchEffect9((onInvalidate) => {
      if (!props.commandPriority)
        return;
      const fn = mergeRegister15(
        props.editor.registerCommand(
          SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND,
          ({ option }) => {
            if (option.ref && option.ref != null) {
              scrollIntoViewIfNeeded(option.ref);
              return true;
            }
            return false;
          },
          props.commandPriority
        )
      );
      onInvalidate(fn);
    });
    watchEffect9((onInvalidate) => {
      if (!props.commandPriority)
        return;
      const fn = mergeRegister15(
        props.editor.registerCommand(
          KEY_ARROW_DOWN_COMMAND2,
          (payload) => {
            const event = payload;
            if (props.options !== null && props.options.length && selectedIndex.value !== null) {
              const newSelectedIndex = selectedIndex.value !== props.options.length - 1 ? selectedIndex.value + 1 : 0;
              updateSelectedIndex(newSelectedIndex);
              const option = props.options[newSelectedIndex];
              if (option.ref != null && option.ref) {
                props.editor.dispatchCommand(
                  SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND,
                  {
                    index: newSelectedIndex,
                    option
                  }
                );
              }
              event.preventDefault();
              event.stopImmediatePropagation();
            }
            return true;
          },
          props.commandPriority
        ),
        props.editor.registerCommand(
          KEY_ARROW_UP_COMMAND2,
          (payload) => {
            const event = payload;
            if (props.options !== null && props.options.length && selectedIndex.value !== null) {
              const newSelectedIndex = selectedIndex.value !== 0 ? selectedIndex.value - 1 : props.options.length - 1;
              updateSelectedIndex(newSelectedIndex);
              const option = props.options[newSelectedIndex];
              if (option.ref != null && option.ref)
                scrollIntoViewIfNeeded(option.ref);
              event.preventDefault();
              event.stopImmediatePropagation();
            }
            return true;
          },
          props.commandPriority
        ),
        props.editor.registerCommand(
          KEY_ESCAPE_COMMAND2,
          (payload) => {
            const event = payload;
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
            return true;
          },
          props.commandPriority
        ),
        props.editor.registerCommand(
          KEY_TAB_COMMAND2,
          (payload) => {
            const event = payload;
            if (props.options === null || selectedIndex.value === null || props.options[selectedIndex.value] == null) {
              return false;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            selectOptionAndCleanUp(props.options[selectedIndex.value]);
            return true;
          },
          props.commandPriority
        ),
        props.editor.registerCommand(
          KEY_ENTER_COMMAND,
          (event) => {
            if (props.options === null || selectedIndex.value === null || props.options[selectedIndex.value] == null) {
              return false;
            }
            if (event !== null) {
              event.preventDefault();
              event.stopImmediatePropagation();
            }
            selectOptionAndCleanUp(props.options[selectedIndex.value]);
            return true;
          },
          props.commandPriority
        )
      );
      onInvalidate(fn);
    });
    return (_ctx, _cache) => {
      return _renderSlot7(_ctx.$slots, "default", {
        listItemProps: {
          options: props.options,
          selectOptionAndCleanUp,
          selectedIndex: selectedIndex.value,
          setHighlightedIndex
        },
        anchorElementRef: _ctx.anchorElementRef,
        matchString: _ctx.resolution.match ? _ctx.resolution.match.matchingString : ""
      });
    };
  }
});
var LexicalMenu_default = _sfc_main23;

// src/components/LexicalContextMenuPlugin.vue
var PRE_PORTAL_DIV_SIZE = 1;
var _sfc_main24 = /* @__PURE__ */ _defineComponent24({
  __name: "LexicalContextMenuPlugin",
  props: {
    options: {},
    anchorClassName: {},
    commandPriority: {},
    parent: {}
  },
  emits: ["close", "open", "willOpen", "selectOption"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const editor = useLexicalComposer();
    const resolution = ref15(null);
    const menuRef = ref15(null);
    const anchorElementRef = useMenuAnchorRef(
      resolution,
      setResolution,
      props.anchorClassName,
      props.parent
    );
    function setResolution(res) {
      resolution.value = res;
    }
    function closeNodeMenu() {
      setResolution(null);
      if (resolution.value !== null)
        emit("close");
    }
    function openNodeMenu(res) {
      setResolution(res);
      if (resolution.value === null)
        emit("open", res);
    }
    function handleContextMenu(event) {
      event.preventDefault();
      emit("willOpen", event);
      const zoom = calculateZoomLevel2(event.target);
      openNodeMenu({
        getRect: () => new DOMRect(
          event.clientX / zoom,
          event.clientY / zoom,
          PRE_PORTAL_DIV_SIZE,
          PRE_PORTAL_DIV_SIZE
        )
      });
    }
    function handleClick(event) {
      if (resolution.value !== null && menuRef.value != null && event.target != null && isDOMNode2(event.target) && !menuRef.value.contains(event.target)) {
        closeNodeMenu();
      }
    }
    onMounted6(() => {
      const editorElement = editor.getRootElement();
      if (editorElement) {
        editorElement.addEventListener("contextmenu", handleContextMenu);
        onUnmounted3(() => {
          editorElement.removeEventListener("contextmenu", handleContextMenu);
        });
      }
    });
    onMounted6(() => {
      document.addEventListener("click", handleClick);
      onUnmounted3(() => {
        document.removeEventListener("click", handleClick);
      });
    });
    return (_ctx, _cache) => {
      return _unref6(anchorElementRef) !== null && resolution.value !== null && _unref6(editor) !== null ? (_openBlock8(), _createBlock2(LexicalMenu_default, {
        key: 0,
        close: closeNodeMenu,
        resolution: resolution.value,
        editor: _unref6(editor),
        "anchor-element-ref": _unref6(anchorElementRef),
        options: _ctx.options,
        "command-priority": _ctx.commandPriority,
        onSelectOption: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("selectOption", $event))
      }, {
        default: _withCtx(({ anchorElementRef: anchorRef, listItemProps }) => [
          _renderSlot8(_ctx.$slots, "default", _normalizeProps(_guardReactiveProps({
            anchorElementRef: anchorRef,
            listItemProps,
            menuProps: {
              setMenuRef: (el) => {
                menuRef.value = el;
              }
            }
          })))
        ]),
        _: 3
        /* FORWARDED */
      }, 8, ["resolution", "editor", "anchor-element-ref", "options", "command-priority"])) : _createCommentVNode5("v-if", true);
    };
  }
});
var LexicalContextMenuPlugin_default = _sfc_main24;

// src/components/LexicalNodeMenuPlugin.vue
import { defineComponent as _defineComponent25 } from "vue";
import { unref as _unref7, normalizeProps as _normalizeProps2, guardReactiveProps as _guardReactiveProps2, renderSlot as _renderSlot9, withCtx as _withCtx2, openBlock as _openBlock9, createBlock as _createBlock3, createCommentVNode as _createCommentVNode6 } from "vue";
import {
  $getNodeByKey as $getNodeByKey4
} from "lexical";
import { nextTick as nextTick2, ref as ref16, watch as watch2, watchEffect as watchEffect10 } from "vue";
var _sfc_main25 = /* @__PURE__ */ _defineComponent25({
  __name: "LexicalNodeMenuPlugin",
  props: {
    options: {},
    nodeKey: {},
    anchorClassName: {},
    commandPriority: {},
    parent: {}
  },
  emits: ["close", "open", "selectOption"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const editor = useLexicalComposer();
    const resolution = ref16(null);
    function setResolution(payload) {
      resolution.value = payload;
    }
    const anchorElementRef = useMenuAnchorRef(
      resolution,
      setResolution,
      props.anchorClassName,
      props.parent
    );
    function closeNodeMenu() {
      setResolution(null);
      if (resolution.value !== null)
        emit("close");
    }
    function openNodeMenu(res) {
      setResolution(res);
      if (resolution.value === null)
        emit("open", res);
    }
    function positionOrCloseMenu() {
      if (props.nodeKey) {
        editor.update(() => {
          const node = $getNodeByKey4(props.nodeKey);
          const domElement = editor.getElementByKey(props.nodeKey);
          if (node != null && domElement != null) {
            if (resolution.value == null) {
              nextTick2(
                () => openNodeMenu({
                  getRect: () => domElement.getBoundingClientRect()
                })
              );
            }
          }
        });
      } else if (props.nodeKey == null && resolution.value != null) {
        closeNodeMenu();
      }
    }
    watch2(() => props.nodeKey, positionOrCloseMenu, { immediate: true });
    watchEffect10((onInvalidate) => {
      if (props.nodeKey != null) {
        const fn = editor.registerUpdateListener(({ dirtyElements }) => {
          if (dirtyElements.get(props.nodeKey))
            positionOrCloseMenu();
        });
        onInvalidate(fn);
      }
    });
    return (_ctx, _cache) => {
      return resolution.value !== null && _unref7(editor) !== null ? (_openBlock9(), _createBlock3(LexicalMenu_default, {
        key: 0,
        resolution: resolution.value,
        editor: _unref7(editor),
        "anchor-element-ref": _unref7(anchorElementRef),
        options: _ctx.options,
        "command-priority": _ctx.commandPriority,
        close: closeNodeMenu,
        onSelectOption: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("selectOption", $event))
      }, {
        default: _withCtx2((slotProps) => [
          _renderSlot9(_ctx.$slots, "default", _normalizeProps2(_guardReactiveProps2(slotProps)))
        ]),
        _: 3
        /* FORWARDED */
      }, 8, ["resolution", "editor", "anchor-element-ref", "options", "command-priority"])) : _createCommentVNode6("v-if", true);
    };
  }
});
var LexicalNodeMenuPlugin_default = _sfc_main25;

// src/components/LexicalAutoEmbedPlugin/index.vue
import { defineComponent as _defineComponent26 } from "vue";
import { normalizeProps as _normalizeProps3, guardReactiveProps as _guardReactiveProps3, renderSlot as _renderSlot10, withCtx as _withCtx3, openBlock as _openBlock10, createBlock as _createBlock4, createCommentVNode as _createCommentVNode7 } from "vue";
import { $isLinkNode as $isLinkNode3, AutoLinkNode, LinkNode as LinkNode2 } from "@lexical/link";
import {
  $getNodeByKey as $getNodeByKey5,
  $getSelection as $getSelection15,
  COMMAND_PRIORITY_EDITOR as COMMAND_PRIORITY_EDITOR4
} from "lexical";
import { computed as computed9, ref as ref17, watchEffect as watchEffect11 } from "vue";
import { mergeRegister as mergeRegister16 } from "@lexical/utils";

// src/components/LexicalAutoEmbedPlugin/shared.ts
import { createCommand as createCommand3 } from "lexical";
var URL_MATCHER = /((https?:\/\/(www\.)?)|(www\.))[-\w@:%.+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-\w()@:%+.~#?&/=]*)/;
var INSERT_EMBED_COMMAND = createCommand3("INSERT_EMBED_COMMAND");
var AutoEmbedOption = class extends MenuOption2 {
  title;
  onSelect;
  constructor(title, options) {
    super(title);
    this.title = title;
    this.onSelect = options.onSelect.bind(this);
  }
};

// src/components/LexicalAutoEmbedPlugin/index.vue
var _sfc_main26 = /* @__PURE__ */ _defineComponent26({
  __name: "index",
  props: {
    embedConfigs: {},
    getMenuOptions: { type: Function },
    menuCommandPriority: {}
  },
  emits: ["openEmbedModalForConfig"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const editor = useLexicalComposer();
    const nodeKey = ref17(null);
    const activeEmbedConfig = ref17(null);
    function reset() {
      nodeKey.value = null;
      activeEmbedConfig.value = null;
    }
    async function checkIfLinkNodeIsEmbeddable(key) {
      const url = editor.getEditorState().read(() => {
        const linkNode = $getNodeByKey5(key);
        if ($isLinkNode3(linkNode)) {
          return linkNode.getURL();
        }
      });
      if (url === void 0) {
        return;
      }
      for (const embedConfig of props.embedConfigs) {
        const urlMatch = await Promise.resolve(embedConfig.parseUrl(url));
        if (urlMatch != null) {
          activeEmbedConfig.value = embedConfig;
          nodeKey.value = key;
        }
      }
    }
    const listener = (nodeMutations, { updateTags, dirtyLeaves }) => {
      for (const [key, mutation] of nodeMutations) {
        if (mutation === "created" && updateTags.has("paste") && dirtyLeaves.size <= 3) {
          checkIfLinkNodeIsEmbeddable(key);
        } else if (key === nodeKey.value) {
          reset();
        }
      }
    };
    watchEffect11((onInvalidate) => {
      const cleanup = mergeRegister16(
        ...[LinkNode2, AutoLinkNode].map(
          (Klass) => editor.registerMutationListener(Klass, (...args) => listener(...args))
        )
      );
      onInvalidate(cleanup);
    });
    watchEffect11((onInvalidate) => {
      const cleanup = editor.registerCommand(
        INSERT_EMBED_COMMAND,
        (embedConfigType) => {
          const embedConfig = props.embedConfigs.find(
            ({ type }) => type === embedConfigType
          );
          if (embedConfig) {
            emit("openEmbedModalForConfig", embedConfig);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_EDITOR4
      );
      onInvalidate(cleanup);
    });
    async function embedLinkViaActiveEmbedConfig() {
      if (activeEmbedConfig.value != null && nodeKey.value != null) {
        const linkNode = editor.getEditorState().read(() => {
          const node = $getNodeByKey5(nodeKey.value);
          if ($isLinkNode3(node))
            return node;
          return null;
        });
        if ($isLinkNode3(linkNode)) {
          const result = await Promise.resolve(
            activeEmbedConfig.value.parseUrl(linkNode.__url)
          );
          if (result != null) {
            editor.update(() => {
              if (!$getSelection15())
                linkNode.selectEnd();
              activeEmbedConfig.value?.insertNode(editor, result);
              if (linkNode.isAttached())
                linkNode.remove();
            });
          }
        }
      }
    }
    const options = computed9(() => activeEmbedConfig.value != null && nodeKey.value != null ? props.getMenuOptions(activeEmbedConfig.value, embedLinkViaActiveEmbedConfig, reset) : []);
    function onSelectOption({
      option: selectedOption,
      closeMenu,
      textNodeContainingQuery: targetNode
    }) {
      editor.update(() => {
        selectedOption.onSelect(targetNode);
        closeMenu();
      });
    }
    return (_ctx, _cache) => {
      return nodeKey.value !== null ? (_openBlock10(), _createBlock4(LexicalNodeMenuPlugin_default, {
        key: 0,
        "node-key": nodeKey.value,
        close: reset,
        options: options.value,
        "command-priority": _ctx.menuCommandPriority,
        onSelectOption
      }, {
        default: _withCtx3((slotProps) => [
          _renderSlot10(_ctx.$slots, "default", _normalizeProps3(_guardReactiveProps3(slotProps)))
        ]),
        _: 3
        /* FORWARDED */
      }, 8, ["node-key", "options", "command-priority"])) : _createCommentVNode7("v-if", true);
    };
  }
});
var LexicalAutoEmbedPlugin_default = _sfc_main26;

// src/components/LexicalAutoLinkPlugin/index.vue
import { defineComponent as _defineComponent27 } from "vue";

// src/components/LexicalAutoLinkPlugin/shared.ts
import { toValue as toValue4, watchEffect as watchEffect12 } from "vue";
import invariant4 from "tiny-invariant";
import {
  $createAutoLinkNode,
  $isAutoLinkNode,
  $isLinkNode as $isLinkNode4,
  AutoLinkNode as AutoLinkNode2,
  TOGGLE_LINK_COMMAND as TOGGLE_LINK_COMMAND2
} from "@lexical/link";
import { mergeRegister as mergeRegister17 } from "@lexical/utils";
import {
  $createTextNode,
  $getSelection as $getSelection16,
  $isElementNode as $isElementNode6,
  $isLineBreakNode,
  $isNodeSelection as $isNodeSelection5,
  $isRangeSelection as $isRangeSelection11,
  $isTextNode as $isTextNode3,
  COMMAND_PRIORITY_LOW as COMMAND_PRIORITY_LOW6,
  TextNode as TextNode2
} from "lexical";
function findFirstMatch(text, matchers) {
  for (let i = 0; i < matchers.length; i++) {
    const match = matchers[i](text);
    if (match)
      return match;
  }
  return null;
}
var PUNCTUATION_OR_SPACE = /[.,;\s]/;
function isSeparator(char) {
  return PUNCTUATION_OR_SPACE.test(char);
}
function endsWithSeparator(textContent) {
  return isSeparator(textContent[textContent.length - 1]);
}
function startsWithSeparator(textContent) {
  return isSeparator(textContent[0]);
}
function isPreviousNodeValid(node) {
  let previousNode = node.getPreviousSibling();
  if ($isElementNode6(previousNode))
    previousNode = previousNode.getLastDescendant();
  return previousNode === null || $isLineBreakNode(previousNode) || $isTextNode3(previousNode) && endsWithSeparator(previousNode.getTextContent());
}
function isNextNodeValid(node) {
  let nextNode = node.getNextSibling();
  if ($isElementNode6(nextNode))
    nextNode = nextNode.getFirstDescendant();
  return nextNode === null || $isLineBreakNode(nextNode) || $isTextNode3(nextNode) && startsWithSeparator(nextNode.getTextContent());
}
function isContentAroundIsValid(matchStart, matchEnd, text, node) {
  const contentBeforeIsValid = matchStart > 0 ? isSeparator(text[matchStart - 1]) : isPreviousNodeValid(node);
  if (!contentBeforeIsValid)
    return false;
  const contentAfterIsValid = matchEnd < text.length ? isSeparator(text[matchEnd]) : isNextNodeValid(node);
  return contentAfterIsValid;
}
function $handleLinkCreation(nodes, matchers, onChange) {
  let currentNodes = [...nodes];
  const initialText = currentNodes.map((node) => node.getTextContent()).join("");
  let text = initialText;
  let match;
  let invalidMatchEnd = 0;
  while ((match = findFirstMatch(text, matchers)) && match !== null) {
    const matchStart = match.index;
    const matchLength = match.length;
    const matchEnd = matchStart + matchLength;
    const isValid = isContentAroundIsValid(
      invalidMatchEnd + matchStart,
      invalidMatchEnd + matchEnd,
      initialText,
      // @ts-expect-error: currentNodes is a single TextNode here
      currentNodes
    );
    if (isValid) {
      const [matchingOffset, , matchingNodes, unmodifiedAfterNodes] = extractMatchingNodes(
        currentNodes,
        invalidMatchEnd + matchStart,
        invalidMatchEnd + matchEnd
      );
      const actualMatchStart = invalidMatchEnd + matchStart - matchingOffset;
      const actualMatchEnd = invalidMatchEnd + matchEnd - matchingOffset;
      const remainingTextNode = $createAutoLinkNode_(
        matchingNodes,
        actualMatchStart,
        actualMatchEnd,
        match
      );
      currentNodes = remainingTextNode ? [remainingTextNode, ...unmodifiedAfterNodes] : unmodifiedAfterNodes;
      onChange(match.url, null);
      invalidMatchEnd = 0;
    } else {
      invalidMatchEnd += matchEnd;
    }
    text = text.substring(matchEnd);
  }
}
function handleLinkEdit(linkNode, matchers, onChange) {
  const children = linkNode.getChildren();
  const childrenLength = children.length;
  for (let i = 0; i < childrenLength; i++) {
    const child = children[i];
    if (!$isTextNode3(child) || !child.isSimpleText()) {
      replaceWithChildren(linkNode);
      onChange(null, linkNode.getURL());
      return;
    }
  }
  const text = linkNode.getTextContent();
  const match = findFirstMatch(text, matchers);
  if (match === null || match.text !== text) {
    replaceWithChildren(linkNode);
    onChange(null, linkNode.getURL());
    return;
  }
  if (!isPreviousNodeValid(linkNode) || !isNextNodeValid(linkNode)) {
    replaceWithChildren(linkNode);
    onChange(null, linkNode.getURL());
    return;
  }
  const url = linkNode.getURL();
  if (url !== match.url) {
    linkNode.setURL(match.url);
    onChange(match.url, url);
  }
  if (match.attributes) {
    const rel = linkNode.getRel();
    if (rel !== match.attributes.rel) {
      linkNode.setRel(match.attributes.rel || null);
      onChange(match.attributes.rel || null, rel);
    }
    const target = linkNode.getTarget();
    if (target !== match.attributes.target) {
      linkNode.setTarget(match.attributes.target || null);
      onChange(match.attributes.target || null, target);
    }
  }
}
function handleBadNeighbors(textNode, matchers, onChange) {
  const previousSibling = textNode.getPreviousSibling();
  const nextSibling = textNode.getNextSibling();
  const text = textNode.getTextContent();
  if ($isAutoLinkNode(previousSibling) && !previousSibling.getIsUnlinked() && (!startsWithSeparator(text) || startsWithTLD(text, previousSibling.isEmailURI()))) {
    previousSibling.append(textNode);
    handleLinkEdit(previousSibling, matchers, onChange);
    onChange(null, previousSibling.getURL());
  }
  if ($isAutoLinkNode(nextSibling) && !nextSibling.getIsUnlinked() && !endsWithSeparator(text)) {
    replaceWithChildren(nextSibling);
    handleLinkEdit(nextSibling, matchers, onChange);
    onChange(null, nextSibling.getURL());
  }
}
function replaceWithChildren(node) {
  const children = node.getChildren();
  const childrenLength = children.length;
  for (let j = childrenLength - 1; j >= 0; j--)
    node.insertAfter(children[j]);
  node.remove();
  return children.map((child) => child.getLatest());
}
function useAutoLink(editor, matchers, onChange) {
  watchEffect12((onInvalidate) => {
    if (!editor.hasNodes([AutoLinkNode2]))
      invariant4(false, "LexicalAutoLinkPlugin: AutoLinkNode not registered on editor");
    const onChangeWrapped = (url, prevUrl) => {
      if (onChange)
        onChange(url, prevUrl);
    };
    const fn = mergeRegister17(
      editor.registerNodeTransform(TextNode2, (textNode) => {
        const parent = textNode.getParentOrThrow();
        const previous = textNode.getPreviousSibling();
        if ($isAutoLinkNode(parent) && !parent.getIsUnlinked()) {
          handleLinkEdit(parent, toValue4(matchers), onChangeWrapped);
        } else if (!$isLinkNode4(parent)) {
          if (textNode.isSimpleText() && (startsWithSeparator(textNode.getTextContent()) || !$isAutoLinkNode(previous))) {
            const textNodesToMatch = getTextNodesToMatch(textNode);
            $handleLinkCreation(textNodesToMatch, toValue4(matchers), onChangeWrapped);
          }
          handleBadNeighbors(textNode, toValue4(matchers), onChangeWrapped);
        }
      }),
      editor.registerCommand(
        TOGGLE_LINK_COMMAND2,
        (payload) => {
          const selection = $getSelection16();
          if (payload !== null || !$isRangeSelection11(selection)) {
            return false;
          }
          const nodes = selection.extract();
          nodes.forEach((node) => {
            const parent = node.getParent();
            if ($isAutoLinkNode(parent)) {
              parent.setIsUnlinked(!parent.getIsUnlinked());
              parent.markDirty();
              return true;
            }
          });
          return false;
        },
        COMMAND_PRIORITY_LOW6
      )
    );
    onInvalidate(fn);
  });
}
function createLinkMatcherWithRegExp(regExp, urlTransformer = (text) => text) {
  return (text) => {
    const match = regExp.exec(text);
    if (match === null)
      return null;
    return {
      index: match.index,
      length: match[0].length,
      text: match[0],
      url: urlTransformer(match[0])
    };
  };
}
function startsWithTLD(textContent, isEmail) {
  if (isEmail) {
    return /^\\.[a-z]{2,}/i.test(textContent);
  } else {
    return /^\\.[a-z0-9]+/i.test(textContent);
  }
}
function extractMatchingNodes(nodes, startIndex, endIndex) {
  const unmodifiedBeforeNodes = [];
  const matchingNodes = [];
  const unmodifiedAfterNodes = [];
  let matchingOffset = 0;
  let currentOffset = 0;
  const currentNodes = [...nodes];
  while (currentNodes.length > 0) {
    const currentNode = currentNodes[0];
    const currentNodeText = currentNode.getTextContent();
    const currentNodeLength = currentNodeText.length;
    const currentNodeStart = currentOffset;
    const currentNodeEnd = currentOffset + currentNodeLength;
    if (currentNodeEnd <= startIndex) {
      unmodifiedBeforeNodes.push(currentNode);
      matchingOffset += currentNodeLength;
    } else if (currentNodeStart >= endIndex) {
      unmodifiedAfterNodes.push(currentNode);
    } else {
      matchingNodes.push(currentNode);
    }
    currentOffset += currentNodeLength;
    currentNodes.shift();
  }
  return [
    matchingOffset,
    unmodifiedBeforeNodes,
    matchingNodes,
    unmodifiedAfterNodes
  ];
}
function $createAutoLinkNode_(nodes, startIndex, endIndex, match) {
  const linkNode = $createAutoLinkNode(match.url, match.attributes);
  if (nodes.length === 1) {
    let remainingTextNode = nodes[0];
    let linkTextNode;
    if (startIndex === 0) {
      [linkTextNode, remainingTextNode] = remainingTextNode.splitText(endIndex);
    } else {
      [, linkTextNode, remainingTextNode] = remainingTextNode.splitText(
        startIndex,
        endIndex
      );
    }
    const textNode = $createTextNode(match.text);
    textNode.setFormat(linkTextNode.getFormat());
    textNode.setDetail(linkTextNode.getDetail());
    textNode.setStyle(linkTextNode.getStyle());
    linkNode.append(textNode);
    linkTextNode.replace(linkNode);
    return remainingTextNode;
  } else if (nodes.length > 1) {
    const firstTextNode = nodes[0];
    let offset = firstTextNode.getTextContent().length;
    let firstLinkTextNode;
    if (startIndex === 0) {
      firstLinkTextNode = firstTextNode;
    } else {
      [, firstLinkTextNode] = firstTextNode.splitText(startIndex);
    }
    const linkNodes = [];
    let remainingTextNode;
    for (let i = 1; i < nodes.length; i++) {
      const currentNode = nodes[i];
      const currentNodeText = currentNode.getTextContent();
      const currentNodeLength = currentNodeText.length;
      const currentNodeStart = offset;
      const currentNodeEnd = offset + currentNodeLength;
      if (currentNodeStart < endIndex) {
        if (currentNodeEnd <= endIndex) {
          linkNodes.push(currentNode);
        } else {
          const [linkTextNode, endNode] = currentNode.splitText(
            endIndex - currentNodeStart
          );
          linkNodes.push(linkTextNode);
          remainingTextNode = endNode;
        }
      }
      offset += currentNodeLength;
    }
    const selection = $getSelection16();
    const selectedTextNode = selection ? selection.getNodes().find($isTextNode3) : void 0;
    const textNode = $createTextNode(firstLinkTextNode.getTextContent());
    textNode.setFormat(firstLinkTextNode.getFormat());
    textNode.setDetail(firstLinkTextNode.getDetail());
    textNode.setStyle(firstLinkTextNode.getStyle());
    linkNode.append(textNode, ...linkNodes);
    if (selectedTextNode && selectedTextNode === firstLinkTextNode) {
      if ($isRangeSelection11(selection)) {
        textNode.select(selection.anchor.offset, selection.focus.offset);
      } else if ($isNodeSelection5(selection)) {
        textNode.select(0, textNode.getTextContent().length);
      }
    }
    firstLinkTextNode.replace(linkNode);
    return remainingTextNode;
  }
  return void 0;
}
function getTextNodesToMatch(textNode) {
  const textNodesToMatch = [textNode];
  let nextSibling = textNode.getNextSibling();
  while (nextSibling !== null && $isTextNode3(nextSibling) && nextSibling.isSimpleText()) {
    textNodesToMatch.push(nextSibling);
    if (/\s/.test(nextSibling.getTextContent()))
      break;
    nextSibling = nextSibling.getNextSibling();
  }
  return textNodesToMatch;
}

// src/components/LexicalAutoLinkPlugin/index.vue
var _sfc_main27 = /* @__PURE__ */ _defineComponent27({
  __name: "index",
  props: {
    matchers: {}
  },
  emits: ["change"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const editor = useLexicalComposer();
    useAutoLink(editor, () => props.matchers, (url, prevUrl) => {
      emit("change", {
        url,
        prevUrl
      });
    });
    return (_ctx, _cache) => {
      return null;
    };
  }
});
var LexicalAutoLinkPlugin_default = _sfc_main27;

// src/components/LexicalTypeaheadMenuPlugin/index.vue
import { defineComponent as _defineComponent28 } from "vue";
import { unref as _unref8, normalizeProps as _normalizeProps4, guardReactiveProps as _guardReactiveProps4, renderSlot as _renderSlot11, withCtx as _withCtx4, openBlock as _openBlock11, createBlock as _createBlock5, createCommentVNode as _createCommentVNode8 } from "vue";
import { $getSelection as $getSelection17, $isRangeSelection as $isRangeSelection12, $isTextNode as $isTextNode4, COMMAND_PRIORITY_LOW as COMMAND_PRIORITY_LOW7 } from "lexical";
import { nextTick as nextTick3, ref as ref18, watchEffect as watchEffect13 } from "vue";
var _sfc_main28 = /* @__PURE__ */ _defineComponent28({
  __name: "index",
  props: {
    options: {},
    triggerFn: {},
    anchorClassName: {},
    commandPriority: { default: COMMAND_PRIORITY_LOW7 },
    parent: {}
  },
  emits: ["close", "open", "queryChange", "selectOption"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const editor = useLexicalComposer();
    const resolution = ref18(null);
    function setResolution(payload) {
      resolution.value = payload;
    }
    const anchorElementRef = useMenuAnchorRef(
      resolution,
      setResolution,
      props.anchorClassName,
      props.parent
    );
    function closeTypeahead() {
      setResolution(null);
      if (resolution.value !== null)
        emit("close");
    }
    function openTypeahead(res) {
      setResolution(res);
      if (resolution.value === null)
        emit("open", res);
    }
    function getTextUpToAnchor(selection) {
      const anchor = selection.anchor;
      if (anchor.type !== "text")
        return null;
      const anchorNode = anchor.getNode();
      if (!anchorNode.isSimpleText())
        return null;
      const anchorOffset = anchor.offset;
      return anchorNode.getTextContent().slice(0, anchorOffset);
    }
    function tryToPositionRange(leadOffset, range, editorWindow) {
      const domSelection = editorWindow.getSelection();
      if (domSelection === null || !domSelection.isCollapsed)
        return false;
      const anchorNode = domSelection.anchorNode;
      const startOffset = leadOffset;
      const endOffset = domSelection.anchorOffset;
      if (anchorNode == null || endOffset == null)
        return false;
      try {
        range.setStart(anchorNode, startOffset);
        range.setEnd(anchorNode, endOffset);
      } catch {
        return false;
      }
      return true;
    }
    function getQueryTextForSearch(editor2) {
      let text = null;
      editor2.getEditorState().read(() => {
        const selection = $getSelection17();
        if (!$isRangeSelection12(selection))
          return;
        text = getTextUpToAnchor(selection);
      });
      return text;
    }
    function isSelectionOnEntityBoundary(editor2, offset) {
      if (offset !== 0)
        return false;
      return editor2.getEditorState().read(() => {
        const selection = $getSelection17();
        if ($isRangeSelection12(selection)) {
          const anchor = selection.anchor;
          const anchorNode = anchor.getNode();
          const prevSibling = anchorNode.getPreviousSibling();
          return $isTextNode4(prevSibling) && prevSibling.isTextEntity();
        }
        return false;
      });
    }
    watchEffect13((onInvalidate) => {
      const updateListener = () => {
        editor.getEditorState().read(() => {
          if (!editor.isEditable()) {
            closeTypeahead();
            return;
          }
          const editorWindow = editor._window || window;
          const range = editorWindow.document.createRange();
          const selection = $getSelection17();
          const text = getQueryTextForSearch(editor);
          if (!$isRangeSelection12(selection) || !selection.isCollapsed() || text === null || range === null) {
            closeTypeahead();
            return;
          }
          const match = props.triggerFn(text, editor);
          emit("queryChange", match ? match.matchingString : null);
          if (match !== null && !isSelectionOnEntityBoundary(editor, match.leadOffset)) {
            const isRangePositioned = tryToPositionRange(
              match.leadOffset,
              range,
              editorWindow
            );
            if (isRangePositioned !== null) {
              nextTick3(() => openTypeahead({
                getRect: () => range.getBoundingClientRect(),
                match
              }));
              return;
            }
          }
          closeTypeahead();
        });
      };
      const removeUpdateListener = editor.registerUpdateListener(updateListener);
      onInvalidate(removeUpdateListener);
    });
    watchEffect13((onInvalidate) => {
      const fn = editor.registerEditableListener((isEditable) => {
        if (!isEditable)
          closeTypeahead();
      });
      onInvalidate(fn);
    });
    return (_ctx, _cache) => {
      return resolution.value !== null && _unref8(editor) !== null ? (_openBlock11(), _createBlock5(LexicalMenu_default, {
        key: 0,
        "anchor-element-ref": _unref8(anchorElementRef),
        editor: _unref8(editor),
        resolution: resolution.value,
        options: _ctx.options,
        "should-split-node-with-query": "",
        "command-priority": _ctx.commandPriority,
        close: closeTypeahead,
        onSelectOption: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("selectOption", $event))
      }, {
        default: _withCtx4((slotProps) => [
          _renderSlot11(_ctx.$slots, "default", _normalizeProps4(_guardReactiveProps4(slotProps)))
        ]),
        _: 3
        /* FORWARDED */
      }, 8, ["anchor-element-ref", "editor", "resolution", "options", "command-priority"])) : _createCommentVNode8("v-if", true);
    };
  }
});
var LexicalTypeaheadMenuPlugin_default = _sfc_main28;

// src/components/LexicalTypeaheadMenuPlugin/shared.ts
import {
  createCommand as createCommand4
} from "lexical";
var PUNCTUATION = `\\.,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%'"~=<>_:;`;
var SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND2 = createCommand4("SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND");
function useBasicTypeaheadTriggerMatch(trigger, { minLength = 1, maxLength = 75 }) {
  return (text) => {
    const validChars = `[^${trigger}${PUNCTUATION}\\s]`;
    const TypeaheadTriggerRegex = new RegExp(
      `(^|\\s|\\()([${trigger}]((?:${validChars}){0,${maxLength}}))$`
    );
    const match = TypeaheadTriggerRegex.exec(text);
    if (match !== null) {
      const maybeLeadingWhitespace = match[1];
      const matchingString = match[3];
      if (matchingString.length >= minLength) {
        return {
          leadOffset: match.index + maybeLeadingWhitespace.length,
          matchingString,
          replaceableString: match[2]
        };
      }
    }
    return null;
  };
}
export {
  $createDecoratorBlockNode,
  $createHorizontalRuleNode,
  $isDecoratorBlockNode,
  $isHorizontalRuleNode,
  AutoEmbedOption,
  DecoratorBlockNode,
  HR,
  HorizontalRuleNode,
  INSERT_EMBED_COMMAND,
  INSERT_HORIZONTAL_RULE_COMMAND,
  LexicalAutoEmbedPlugin_default as LexicalAutoEmbedPlugin,
  LexicalAutoFocusPlugin_default as LexicalAutoFocusPlugin,
  LexicalAutoLinkPlugin_default as LexicalAutoLinkPlugin,
  LexicalAutoScrollPlugin_default as LexicalAutoScrollPlugin,
  LexicalBlockWithAlignableContents_default as LexicalBlockWithAlignableContents,
  LexicalCharacterLimitPlugin_default as LexicalCharacterLimitPlugin,
  LexicalCheckListPlugin_default as LexicalCheckListPlugin,
  LexicalClearEditorPlugin_default as LexicalClearEditorPlugin,
  LexicalClickableLinkPlugin_default as LexicalClickableLinkPlugin,
  LexicalCollaborationPlugin_default as LexicalCollaborationPlugin,
  LexicalComposer_default as LexicalComposer,
  LexicalContentEditable_default as LexicalContentEditable,
  LexicalContextMenuPlugin_default as LexicalContextMenuPlugin,
  LexicalDecoratedTeleports_default as LexicalDecoratedTeleports,
  LexicalHashtagPlugin_default as LexicalHashtagPlugin,
  LexicalHistoryPlugin_default as LexicalHistoryPlugin,
  LexicalLinkPlugin_default as LexicalLinkPlugin,
  LexicalListPlugin_default as LexicalListPlugin,
  LexicalMarkdownShortcutPlugin_default as LexicalMarkdownShortcutPlugin,
  LexicalNodeMenuPlugin_default as LexicalNodeMenuPlugin,
  LexicalOnChangePlugin_default as LexicalOnChangePlugin,
  LexicalPlainTextPlugin_default as LexicalPlainTextPlugin,
  LexicalRichTextPlugin_default as LexicalRichTextPlugin,
  LexicalTabIndentationPlugin_default as LexicalTabIndentationPlugin,
  LexicalTablePlugin_default as LexicalTablePlugin,
  LexicalTreeViewPlugin_default as LexicalTreeViewPlugin,
  LexicalTypeaheadMenuPlugin_default as LexicalTypeaheadMenuPlugin,
  MenuOption2 as MenuOption,
  URL_MATCHER,
  createLinkMatcherWithRegExp,
  mergePrevious,
  useBasicTypeaheadTriggerMatch,
  useCanShowPlaceholder,
  useCharacterLimit,
  useDecorators,
  useEffect,
  useHistory,
  useLexicalCommandsLog,
  useLexicalComposer,
  useLexicalIsTextContentEmpty,
  useLexicalNodeSelection,
  useLexicalTextEntity,
  useList,
  useMounted,
  usePlainTextSetup,
  useRichTextSetup,
  useTableOfContents,
  useYjsCollaboration,
  useYjsFocusTracking,
  useYjsHistory
};
//# sourceMappingURL=index.js.map