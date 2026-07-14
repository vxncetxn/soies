export function open() {
  throw new Error("The native database must not be opened by repository tests");
}
