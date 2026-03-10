import { useEffect, useState } from "react";
import {
  fetchImageModelCatalog,
  type ImageModelCatalog,
} from "@/lib/ai/imageModelCatalog";

export function useImageModelCatalog() {
  const [catalog, setCatalog] = useState<ImageModelCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const nextCatalog = await fetchImageModelCatalog();
        if (cancelled) {
          return;
        }
        setCatalog(nextCatalog);
      } catch (nextError) {
        if (cancelled) {
          return;
        }
        setError(
          nextError instanceof Error ? nextError.message : "Image model catalog could not be loaded."
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    catalog,
    isLoading,
    error,
  };
}
