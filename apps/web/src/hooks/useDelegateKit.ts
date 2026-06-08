import { useDAppKit } from "@mysten/dapp-kit-react";
import type { DelegateKit } from "../lib/delegate-kit.js";

/**
 * The dApp Kit instance, narrowed to the imperative wallet methods this app
 * uses. This is the only place the unsafe cast lives — see `DelegateKit`.
 */
export const useDelegateKit = (): DelegateKit => useDAppKit() as unknown as DelegateKit;
