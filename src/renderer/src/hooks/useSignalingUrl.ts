import { useEffect, useState } from "react";

const STORAGE_KEY = "myremote:signalingUrl";
const DEFAULT_URL = "ws://localhost:8787";

export function useSignalingUrl(): [string, (v: string) => void] {
  const [url, setUrl] = useState<string>(() => localStorage.getItem(STORAGE_KEY) || DEFAULT_URL);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, url);
  }, [url]);

  return [url, setUrl];
}
