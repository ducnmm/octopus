import type { UiWallet } from "@mysten/dapp-kit-react";
import type { Transaction } from "@mysten/sui/transactions";

/**
 * Typed view of the dApp Kit instance returned by `useDAppKit`. The kit's
 * imperative wallet methods are not surfaced on the React binding's public
 * types, so this interface is the single place where their shape is asserted
 * (see `useDelegateKit`). Call sites stay fully typed instead of repeating
 * `as unknown as { … }` casts.
 */
export interface DelegateKit {
  connectWallet(input: { wallet: UiWallet }): Promise<unknown>;
  signTransaction(input: { transaction: string }): Promise<{ signature: string }>;
  signAndExecuteTransaction(input: { transaction: Transaction }): Promise<{ digest?: string } | null>;
  signPersonalMessage(input: { message: Uint8Array }): Promise<{ bytes: string; signature: string }>;
}
