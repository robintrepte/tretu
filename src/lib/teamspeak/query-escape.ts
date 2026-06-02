/** Canonical TeamSpeak unique identifier (base64-style, may contain `/` and `+`). */
export function normalizeTsUuid(uuid: string): string {
  let out = unescapeTsQueryString(uuid.trim());
  for (let i = 0; i < 3; i++) {
    const next = unescapeTsQueryString(out);
    if (next === out) break;
    out = next;
  }
  return out.replace(/\\\//g, "/");
}

/** Decode TeamSpeak ServerQuery escape sequences in response values. */
export function unescapeTsQueryString(value: string): string {
  return value.replace(/\\(.)?/g, (_, ch) => {
    switch (ch) {
      case "s":
        return " ";
      case "p":
        return "|";
      case "/":
        return "/";
      case "\\":
        return "\\";
      case "[":
        return "[";
      case "]":
        return "]";
      case "{":
        return "{";
      case "}":
        return "}";
      case ":":
        return ":";
      case "?":
        return "?";
      case "*":
        return "*";
      case "n":
        return "\n";
      case undefined:
        return "\\";
      default:
        return ch;
    }
  });
}
