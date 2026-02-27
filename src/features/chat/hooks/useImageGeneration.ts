import { useCallback, useState } from "react";

interface ImageGenerationState {
  status: "idle" | "loading" | "done" | "error";
  imageUrl: string | null;
  error: string | null;
}

export function useImageGeneration() {
  const [state, setState] = useState<ImageGenerationState>({
    status: "idle",
    imageUrl: null,
    error: null,
  });

  const generate = useCallback(async (_prompt: string) => {
    setState({ status: "loading", imageUrl: null, error: null });
    setState({
      status: "error",
      imageUrl: null,
      error: "Image generation endpoint is not wired in this phase.",
    });
  }, []);

  return {
    ...state,
    generate,
  };
}
