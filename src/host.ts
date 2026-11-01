/**
 * host.ts — Lab Watch's one SDK client.
 */
import { MnemoCartridgeSDK } from './sdk/mnemo-sdk';

// Must match "name" in mnemo-plugin.json: the host keys the watch on it.
export const sdk = new MnemoCartridgeSDK('@mnemosyne-plugins/mnemo-labwatch');
