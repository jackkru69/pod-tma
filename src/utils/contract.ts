import { Address, beginCell, toNano } from '@ton/core';
import type { Sender, SenderArguments } from '@ton/core';
import type { TonConnectUI } from '@tonconnect/ui';

/**
 * Calculate hash for encrypted bet (matches contract's calculateHash function)
 * @param coinSide 2 for HEADS, 3 for TAILS
 * @param key Random secret key (256-bit integer)
 * @param playerAddress Player's address
 */
export function calculateHash(coinSide: bigint, key: bigint, playerAddress: Address): bigint {
  const builder = beginCell();
  builder.storeUint(coinSide, 8);
  builder.storeUint(key, 256);
  builder.storeAddress(playerAddress);
  return BigInt('0x' + builder.endCell().hash().toString('hex'));
}

/**
 * Generate secret key by signing message with wallet
 * This creates a cryptographically secure 256-bit key using wallet's private key signature
 * The key cannot be bruteforced as it requires the wallet's signature
 *
 * The key is used directly in the contract's calculateHash function:
 * hash = sha256(coinSide + key + playerAddress)
 *
 * When opening the bid, the contract verifies:
 * 1. Receives the key from the user
 * 2. Calculates hash(HEADS, key, player) and hash(TAILS, key, player)
 * 3. Compares with the stored encryptedBet
 * 4. If it matches, reveals the player's choice
 */
export async function generateKeyFromWalletSignature(
  gameId: bigint,
  coinSide: bigint,
  playerAddress: Address,
  tonConnectUI: TonConnectUI
): Promise<bigint | null> {
  try {
    // Create a deterministic message to sign based on game parameters
    const message = beginCell()
      .storeUint(gameId, 256)
      .storeUint(coinSide, 8)
      .storeAddress(playerAddress)
      .endCell();

    // Use TonConnect's signData method to get a cryptographic signature
    // This makes the key wallet-specific and prevents brute-force attacks
    const signResult = await tonConnectUI.connector.signData({
      type: 'cell',
      schema: 'game-key',
      cell: message.toBoc().toString('base64')
    });

    // Use the signature as the key (take first 32 bytes as 256-bit number)
    const signatureBuffer = Buffer.from(signResult.signature, 'base64');
    const key = BigInt('0x' + signatureBuffer.slice(0, 32).toString('hex'));

    return key;
  } catch (error) {
    console.warn('Wallet signature failed, using fallback key generation:', error);
    return null;
  }
}
/**
 * Generate deterministic key from game parameters
 * This creates a reproducible 256-bit key based on game ID, coin side, and player address
 *
 * WARNING: This is less secure than wallet signature as it can be computed by anyone
 * who knows the game parameters. Use generateKeyFromWalletSignature for production.
 *
 * The key is used directly in the contract's calculateHash function:
 * hash = sha256(coinSide + key + playerAddress)
 */


/**
 * Create a Sender implementation using TonConnect UI
 */
export function createTonConnectSender(tonConnectUI: TonConnectUI): Sender {
  return {
    get address() {
      const address = tonConnectUI.account?.address;
      return address ? Address.parse(address) : undefined;
    },
    async send(args: SenderArguments): Promise<void> {
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 360, // 6 minutes
        messages: [
          {
            address: args.to.toString(),
            amount: args.value.toString(),
            payload: args.body ? args.body.toBoc().toString('base64') : undefined,
          },
        ],
      });
    },
  };
}

/**
 * Format TON amount from nanotons
 */
export function formatTon(nanotons: bigint): string {
  const tons = Number(nanotons) / 1e9;
  return tons.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });
}

/**
 * Calculate required value for creating a game
 * bidValue + deployValue + factoryReserve + gasBuffer
 */
export function calculateCreateGameValue(bidValue: string): bigint {
  const bid = toNano(bidValue);
  const deployValue = toNano('0.15');
  const factoryReserve = toNano('0.05');
  const gasBuffer = toNano('0.05');
  return bid + deployValue + factoryReserve + gasBuffer;
}

/**
 * Calculate required value for joining a game
 * bidValue + gasBuffer
 */
export function calculateJoinGameValue(bidValue: bigint): bigint {
  const gasBuffer = toNano('0.05');
  return bidValue + gasBuffer;
}

/**
 * Shorten address for display
 */
export function shortenAddress(address: Address | string): string {
  const addrStr = typeof address === 'string' ? address : address.toString();
  if (addrStr.length < 10) return addrStr;
  return `${addrStr.slice(0, 6)}...${addrStr.slice(-4)}`;
}

