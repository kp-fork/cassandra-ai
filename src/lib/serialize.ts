export function toJSON(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? Number(value) : value
    )
  );
}
