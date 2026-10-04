const memoryFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatMemoryMb(megabytes: number): string {
  return memoryFormat.format(megabytes);
}
