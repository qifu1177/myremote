import { useEffect, useState } from "react";
import type { AppInfo } from "@shared/types";

export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.myremote.getAppInfo().then((i) => {
      if (!cancelled) setInfo(i);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
