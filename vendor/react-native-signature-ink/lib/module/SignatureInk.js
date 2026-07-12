"use strict";

// High-level wrapper around the codegen-generated `SignatureInkView`.
// Owns the request-id ⇄ Promise back-channel for async commands
// (`toBase64`, `toFile`, `toSvg`, `isEmpty`, `getStrokeData`,
// `saveToPhotoLibrary`, `snapshot`) and re-shapes native events into the public
// `Signature*Event` types declared in `./types`.
import * as React from 'react';
import { findNodeHandle, processColor } from 'react-native';
import SignatureInkNativeView, { Commands } from './SignatureInkViewNativeComponent';
import { jsx as _jsx } from "react/jsx-runtime";
// Unique-per-call request id. Native echoes it back on `onResult`
// so the wrapper can route the value to the right pending Promise.
let requestCounter = 0;
const nextRequestId = () => {
  requestCounter = (requestCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `req-${Date.now().toString(36)}-${requestCounter.toString(36)}`;
};
const parseMaybeJson = (value, fallback) => {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

// Dev-only sanity check: a toolbar action is dispatched purely by `id`,
// so two items sharing an id render two buttons that both fire the same
// `onToolbarAction({ id })` (and, for a built-in id, run the native action
// twice) with no way for the handler to tell them apart. Warn once so the
// collision is caught in development; release builds skip this entirely.
const warnOnDuplicateToolbarIds = items => {
  const seen = new Set();
  const duplicates = new Set();
  for (const {
    id
  } of items) {
    if (seen.has(id)) duplicates.add(id);else seen.add(id);
  }
  if (duplicates.size > 0) {
    const ids = Array.from(duplicates).map(id => `"${id}"`).join(', ');
    console.warn(`SignatureInk: duplicate toolbarButtons id(s) ${ids}. ` + 'Each id should be unique — onToolbarAction is keyed by id and ' + 'cannot distinguish duplicate buttons.');
  }
};

// Normalize the public `toolbarButtons` items into the flat JSON shape
// the native side parses: colors are pre-processed to ints and the
// accessibility label is derived (text → id) here so neither platform
// has to. Returns `''` when there are no items, which the native side
// reads as "use the default undo/redo/clear/copy toolbar".
const serializeToolbarItems = items => {
  if (items == null || items.length === 0) return '';
  if (__DEV__) warnOnDuplicateToolbarIds(items);
  const normalized = items.map(item => {
    const processed = item.tintColor != null ? processColor(item.tintColor) : null;
    return {
      id: item.id,
      icon: item.icon ?? null,
      text: item.text ?? null,
      tintColor: typeof processed === 'number' ? processed : null,
      accessibilityLabel: item.accessibilityLabel ?? item.text ?? item.id,
      disabled: item.disabled ?? false
    };
  });
  return JSON.stringify(normalized);
};
export const SignatureInk = /*#__PURE__*/React.forwardRef(function SignatureInk(props, ref) {
  const {
    style,
    onBegin,
    onEnd,
    onChange,
    onReplayProgress,
    onToolbarAction,
    backgroundColor,
    toolbarButtons,
    toolbarMaxVisibleButtons,
    ...rest
  } = props;
  const toolbarItemsJson = React.useMemo(() => serializeToolbarItems(toolbarButtons), [toolbarButtons]);
  const nativeRef = React.useRef(null);
  const pending = React.useRef(new Map());
  React.useEffect(() => {
    const current = pending.current;
    return () => {
      current.forEach(({
        reject
      }) => reject(new Error('SignatureInk unmounted')));
      current.clear();
    };
  }, []);
  const send = React.useCallback((type, dispatch, transform) => {
    return new Promise((resolve, reject) => {
      const node = nativeRef.current;
      if (!node) {
        reject(new Error('SignatureInk: native view is not mounted yet'));
        return;
      }
      const id = nextRequestId();
      pending.current.set(id, {
        type,
        resolve: raw => {
          resolve(transform ? transform(raw) : raw);
        },
        reject
      });
      try {
        dispatch(id);
      } catch (e) {
        pending.current.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }, []);
  const handle = React.useMemo(() => ({
    clear: () => {
      const node = nativeRef.current;
      if (node) Commands.clear(node);
    },
    undo: () => {
      const node = nativeRef.current;
      if (node) Commands.undo(node);
    },
    redo: () => {
      const node = nativeRef.current;
      if (node) Commands.redo(node);
    },
    copyToClipboard: () => {
      const node = nativeRef.current;
      if (node) Commands.copyToClipboard(node);
    },
    replay: options => {
      const node = nativeRef.current;
      if (node) Commands.replay(node, options?.speed ?? 1);
    },
    setStrokeData: data => {
      const node = nativeRef.current;
      if (node) Commands.setStrokeData(node, JSON.stringify(data));
    },
    replaceStrokeData: data => {
      const node = nativeRef.current;
      if (node) Commands.replaceStrokeData(node, JSON.stringify(data));
    },
    beginEraseGesture: () => {
      const node = nativeRef.current;
      if (node) Commands.beginEraseGesture(node);
    },
    eraseStrokeNear: (x, y, radius) => {
      const node = nativeRef.current;
      if (node) Commands.eraseStrokeNear(node, x, y, radius);
    },
    endEraseGesture: () => {
      const node = nativeRef.current;
      if (node) Commands.endEraseGesture(node);
    },
    clearHistory: () => {
      const node = nativeRef.current;
      if (node) Commands.clearHistory(node);
    },
    snapshot: options => send('snapshot', id => Commands.snapshot(nativeRef.current, id, options?.format ?? 'png', options?.quality ?? 1, options?.trim ?? false), raw => {
      const parsed = parseMaybeJson(raw, {});
      return {
        strokes: parsed.strokes ?? [],
        fileUri: parsed.fileUri ?? '',
        canvasWidth: parsed.canvasWidth ?? 0,
        canvasHeight: parsed.canvasHeight ?? 0
      };
    }),
    isEmpty: () => send('isEmpty', id => Commands.isEmpty(nativeRef.current, id), raw => raw === 'true'),
    toBase64: options => send('toBase64', id => Commands.toBase64(nativeRef.current, id, options?.format ?? 'png', options?.quality ?? 1, options?.trim ?? false)),
    toFile: options => send('toFile', id => Commands.toFile(nativeRef.current, id, options?.format ?? 'png', options?.quality ?? 1, options?.trim ?? false)),
    toSvg: () => send('toSvg', id => Commands.toSvg(nativeRef.current, id)),
    getStrokeData: () => send('getStrokeData', id => Commands.getStrokeData(nativeRef.current, id), raw => parseMaybeJson(raw, [])),
    saveToPhotoLibrary: options => send('saveToPhotoLibrary', id => Commands.saveToPhotoLibrary(nativeRef.current, id, options?.format ?? 'png', options?.quality ?? 1, options?.trim ?? true), raw => parseMaybeJson(raw, {
      granted: false
    }))
  }), [send]);
  React.useImperativeHandle(ref, () => handle, [handle]);
  const handleResult = React.useCallback(event => {
    const {
      requestId,
      value,
      error
    } = event.nativeEvent;
    const resolver = pending.current.get(requestId);
    if (!resolver) return;
    pending.current.delete(requestId);
    if (error) {
      resolver.reject(new Error(error));
    } else {
      resolver.resolve(value);
    }
  }, []);
  const handleBegin = React.useCallback(() => {
    onBegin?.();
  }, [onBegin]);
  const handleEnd = React.useCallback(() => {
    onEnd?.();
  }, [onEnd]);
  const handleChange = React.useCallback(event => {
    onChange?.(event.nativeEvent);
  }, [onChange]);
  const handleReplayProgress = React.useCallback(event => {
    onReplayProgress?.({
      progress: event.nativeEvent.progress
    });
  }, [onReplayProgress]);
  const handleToolbarAction = React.useCallback(event => {
    const id = event.nativeEvent.itemId ?? event.nativeEvent.action ?? '';
    onToolbarAction?.({
      id,
      action: id
    });
  }, [onToolbarAction]);
  const nativeProps = {
    ...rest,
    style,
    inkBackgroundColor: backgroundColor,
    toolbarItemsJson,
    toolbarMaxVisibleButtons: toolbarMaxVisibleButtons ?? 0,
    onBegin: handleBegin,
    onEnd: handleEnd,
    onStrokesChange: handleChange,
    onResult: handleResult,
    onReplayProgress: handleReplayProgress,
    onToolbarAction: handleToolbarAction
  };
  return /*#__PURE__*/_jsx(SignatureInkNativeView, {
    ref: nativeRef,
    ...nativeProps
  });
});
// Re-exported for advanced consumers who want to call findNodeHandle / processColor
// against the raw view without going through the wrapper.
export const _internal = {
  findNodeHandle,
  processColor
};