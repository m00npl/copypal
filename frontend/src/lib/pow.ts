// Simple Proof of Work implementation for spam prevention

interface PoWResult {
  nonce: number
  salt: Uint8Array
  digest: string
  difficulty: number
}

// Convert array buffer to hex string
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Count leading zero bits in hex string
function leadingZeroBits(hex: string): number {
  let count = 0
  for (const char of hex) {
    const num = parseInt(char, 16)
    if (num === 0) {
      count += 4
    } else {
      // Count bits in the first non-zero nibble
      count += Math.clz32(num) - 28
      break
    }
  }
  return count
}

// Concatenate salt and nonce
function concatSaltNonce(salt: Uint8Array, nonce: number): Uint8Array {
  const nonceBytes = new Uint8Array(4)
  const view = new DataView(nonceBytes.buffer)
  view.setUint32(0, nonce, false) // big-endian

  const combined = new Uint8Array(salt.length + 4)
  combined.set(salt)
  combined.set(nonceBytes, salt.length)
  return combined
}

// SHA-256 hash function
async function sha256(data: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return bufferToHex(buffer)
}

// Main PoW function
export async function doPow(difficulty: number = 18): Promise<PoWResult> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  let nonce = 0

  while (true) {
    const combined = concatSaltNonce(salt, nonce)
    const digest = await sha256(combined)

    if (leadingZeroBits(digest) >= difficulty) {
      return {
        nonce,
        salt,
        digest,
        difficulty
      }
    }

    nonce++

    // Yield control every 1000 iterations to prevent blocking
    if (nonce % 1000 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
}

// Verify PoW result
export async function verifyPow(result: PoWResult): Promise<boolean> {
  try {
    const combined = concatSaltNonce(result.salt, result.nonce)
    const digest = await sha256(combined)

    return digest === result.digest &&
           leadingZeroBits(digest) >= result.difficulty
  } catch {
    return false
  }
}