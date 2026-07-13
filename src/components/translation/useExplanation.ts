import { useCallback, useState } from "react";
import { explainDirectly } from "@/lib/settings";

/**
 * Shared explanation state and "解説" request logic for the translation
 * popup and standalone translation window.
 */
export function useExplanation() {
  const [explanationSummary, setExplanationSummary] = useState<string | null>(
    null,
  );
  const [explanationPoints, setExplanationPoints] = useState<string[] | null>(
    null,
  );
  const [isExplaining, setIsExplaining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explain = useCallback(
    (
      selectedText: string,
      contextBefore: string,
      contextAfter: string,
      explanationModel: string,
    ) => {
      setIsExplaining(true);
      setError(null);

      // Use setTimeout to allow React to re-render before the blocking API call
      setTimeout(async () => {
        try {
          const result = await explainDirectly(
            selectedText,
            contextBefore,
            contextAfter,
            explanationModel,
          );

          setExplanationSummary(result.summary);
          setExplanationPoints(result.points);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setIsExplaining(false);
        }
      }, 0);
    },
    [],
  );

  return {
    explanationSummary,
    setExplanationSummary,
    explanationPoints,
    setExplanationPoints,
    isExplaining,
    error,
    setError,
    explain,
  };
}
