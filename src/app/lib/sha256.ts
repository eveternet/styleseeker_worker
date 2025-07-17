export async function sha256(message: string) {
  // Encode the message as a Uint8Array
  const textEncoder = new TextEncoder();
  const data = textEncoder.encode(message);

  // Use the Web Cryptography API to hash the data
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convert the ArrayBuffer to a hexadecimal string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hexHash;
}
