export const shouldAutoLoadPromptObservability = (
  isOpen: boolean,
  turnCount: number,
  status: "idle" | "loading" | "loaded" | "error"
) => isOpen && turnCount > 0 && status === "idle";
