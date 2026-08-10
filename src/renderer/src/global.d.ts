import type { MyRemoteApi } from "../../preload/index";

declare global {
  interface Window {
    myremote: MyRemoteApi;
  }
}

export {};
