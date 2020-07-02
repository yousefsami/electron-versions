export const bufferFromUint8Array = (array: Uint8Array | undefined) => {
  if (array == null) return null;
  return Buffer.from(new Uint8Array(array));
};
