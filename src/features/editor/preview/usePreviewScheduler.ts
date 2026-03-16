import { useEffect, useRef } from "react";
import type { DirtyKeyMap, DirtyReason } from "../renderGraph";
import type { PreviewQuality } from "./contracts";

export const PREVIEW_FULL_QUALITY_DELAY_MS = 200;

export interface PreviewSchedulerDescriptor<Request> {
  documentKey: string;
  dirtyKeys?: Partial<DirtyKeyMap>;
  createRequest: (quality: PreviewQuality, dirtyReasons: DirtyReason[]) => Request;
  immediateFull?: boolean;
}

interface CreatePreviewSchedulerControllerOptions<
  Request extends { quality: PreviewQuality },
  ExecutionResult extends object,
> {
  execute: (
    request: Request,
    signal: AbortSignal,
    requestId: number
  ) => Promise<ExecutionResult>;
  fullDelayMs?: number;
  onError?: (error: unknown, request: Request) => void;
  onResult: (result: ExecutionResult & { requestId: number; quality: PreviewQuality }) => void;
}

export function createPreviewSchedulerController<
  Request extends { quality: PreviewQuality },
  ExecutionResult extends object,
>({
  execute,
  fullDelayMs = PREVIEW_FULL_QUALITY_DELAY_MS,
  onError,
  onResult,
}: CreatePreviewSchedulerControllerOptions<Request, ExecutionResult>) {
  const abortControllers = new Map<PreviewQuality, AbortController>();
  const dirtyKeysByDocument = new Map<string, Partial<DirtyKeyMap>>();
  let fullTimer: ReturnType<typeof setTimeout> | null = null;
  let lastDocumentKey: string | null = null;
  let latestIssuedRequestId = 0;

  const clearPendingFullTimer = () => {
    if (fullTimer !== null) {
      clearTimeout(fullTimer);
      fullTimer = null;
    }
  };

  const abortQuality = (quality: PreviewQuality) => {
    const controller = abortControllers.get(quality);
    if (!controller) {
      return;
    }
    controller.abort();
    abortControllers.delete(quality);
  };

  const clear = () => {
    clearPendingFullTimer();
    abortQuality("interactive");
    abortQuality("full");
    dirtyKeysByDocument.clear();
    lastDocumentKey = null;
  };

  const startRequest = (
    descriptor: PreviewSchedulerDescriptor<Request>,
    quality: PreviewQuality,
    dirtyReasons: DirtyReason[] = []
  ) => {
    abortQuality(quality);
    abortQuality(quality === "full" ? "interactive" : "full");
    const request = descriptor.createRequest(quality, dirtyReasons);
    const requestId = latestIssuedRequestId + 1;
    latestIssuedRequestId = requestId;
    const controller = new AbortController();
    abortControllers.set(quality, controller);

    void execute(request, controller.signal, requestId)
      .then((executionResult) => {
        if (controller.signal.aborted || requestId < latestIssuedRequestId) {
          return;
        }
        onResult({
          ...executionResult,
          requestId,
          quality,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        onError?.(error, request);
      })
      .finally(() => {
        if (abortControllers.get(quality) === controller) {
          abortControllers.delete(quality);
        }
      });
  };

  const schedule = (descriptor: PreviewSchedulerDescriptor<Request>) => {
    const documentChanged = descriptor.documentKey !== lastDocumentKey;
    const previousDirtyKeys = dirtyKeysByDocument.get(descriptor.documentKey);
    const nextDirtyKeys = descriptor.dirtyKeys ?? null;
    const dirtyReasons = nextDirtyKeys
      ? (Object.entries(nextDirtyKeys)
          .filter(([reason, value]) => {
            if (!value) {
              return false;
            }
            if (documentChanged || !previousDirtyKeys) {
              return true;
            }
            return previousDirtyKeys[reason as keyof DirtyKeyMap] !== value;
          })
          .map(([reason]) => reason as DirtyReason))
      : [];
    lastDocumentKey = descriptor.documentKey;
    clearPendingFullTimer();
    if (nextDirtyKeys) {
      dirtyKeysByDocument.set(descriptor.documentKey, nextDirtyKeys);
    }

    if (descriptor.immediateFull || documentChanged) {
      abortQuality("interactive");
      abortQuality("full");
      startRequest(descriptor, "full", dirtyReasons);
      return;
    }

    startRequest(descriptor, "interactive", dirtyReasons);
    fullTimer = setTimeout(() => {
      fullTimer = null;
      startRequest(descriptor, "full", dirtyReasons);
    }, fullDelayMs);
  };

  return {
    clear,
    schedule,
  };
}

interface UsePreviewSchedulerOptions<
  Request extends { quality: PreviewQuality },
  ExecutionResult extends object,
> extends CreatePreviewSchedulerControllerOptions<Request, ExecutionResult> {
  descriptor: PreviewSchedulerDescriptor<Request> | null;
}

export function usePreviewScheduler<
  Request extends { quality: PreviewQuality },
  ExecutionResult extends object,
>({
  descriptor,
  execute,
  fullDelayMs = PREVIEW_FULL_QUALITY_DELAY_MS,
  onError,
  onResult,
}: UsePreviewSchedulerOptions<Request, ExecutionResult>) {
  const executeRef = useRef(execute);
  const onErrorRef = useRef(onError);
  const onResultRef = useRef(onResult);
  const controllerRef = useRef<
    ReturnType<typeof createPreviewSchedulerController<Request, ExecutionResult>> | null
  >(null);

  executeRef.current = execute;
  onErrorRef.current = onError;
  onResultRef.current = onResult;

  if (controllerRef.current === null) {
    controllerRef.current = createPreviewSchedulerController<Request, ExecutionResult>({
      execute: (request, signal, requestId) => executeRef.current(request, signal, requestId),
      fullDelayMs,
      onError: (error, request) => onErrorRef.current?.(error, request),
      onResult: (result) => onResultRef.current(result),
    });
  }

  useEffect(() => {
    return () => {
      controllerRef.current?.clear();
    };
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) {
      return;
    }
    if (!descriptor) {
      controller.clear();
      return;
    }
    controller.schedule(descriptor);
  }, [descriptor]);
}
