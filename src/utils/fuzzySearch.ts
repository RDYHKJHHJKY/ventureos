/**
 * Fuzzy search utility for command matching
 */

/**
 * Simple fuzzy match score calculation
 * Returns 0-1 score where 1 is perfect match
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact match
  if (t === q) return 1;

  // Starts with
  if (t.startsWith(q)) return 0.9;

  // Contains exact substring
  if (t.includes(q)) return 0.7;

  // Character-by-character fuzzy match
  let queryIdx = 0;
  let score = 0;
  let consecutiveMatches = 0;

  for (let i = 0; i < t.length && queryIdx < q.length; i++) {
    if (t[i] === q[queryIdx]) {
      queryIdx++;
      consecutiveMatches++;
      score += 0.1 + (consecutiveMatches * 0.01); // Bonus for consecutive matches
    } else {
      consecutiveMatches = 0;
    }
  }

  // If not all query characters matched, return 0
  if (queryIdx < q.length) return 0;

  // Normalize score to 0-1 range
  return Math.min(score / q.length, 0.6);
}

/**
 * Search commands by query
 */
export function searchCommands(
  query: string,
  commands: any[]
): Array<{ command: any; score: number }> {
  if (!query.trim()) {
    return commands.map(cmd => ({ command: cmd, score: 1 }));
  }

  const q = query.toLowerCase();
  const results = commands
    .map(cmd => {
      // Check label and description
      const labelScore = fuzzyScore(q, cmd.label);
      const descScore = cmd.description ? fuzzyScore(q, cmd.description) * 0.5 : 0;

      // Check keywords
      const keywordScores = cmd.keywords.map((k: string) => fuzzyScore(q, k));
      const maxKeywordScore = keywordScores.length > 0 ? Math.max(...keywordScores) * 0.8 : 0;

      // Combined score
      const score = Math.max(labelScore, descScore, maxKeywordScore);

      return { command: cmd, score };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score);

  return results;
}
