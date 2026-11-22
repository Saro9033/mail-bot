const PLACEHOLDER_PATTERN = /\[[^\]]+\]/g;

export function findPlaceholders(text: string): string[] {
  const matches = text.match(PLACEHOLDER_PATTERN);
  return matches ?? [];
}

export function hasPlaceholders(text: string): boolean {
  return findPlaceholders(text).length > 0;
}

export function validateEmailContent(subject: string, body: string): string | null {
  const subjectPlaceholders = findPlaceholders(subject);
  const bodyPlaceholders = findPlaceholders(body);

  if (subjectPlaceholders.length > 0 || bodyPlaceholders.length > 0) {
    const all = [...subjectPlaceholders, ...bodyPlaceholders];
    return `Email contains placeholders (${all.join(', ')}). Ask the user for real values before sending.`;
  }

  return null;
}
