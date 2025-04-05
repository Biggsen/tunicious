/**
 * Calculates the Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - The Levenshtein distance
 */
export function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // substitution
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1      // insertion
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculates similarity between two strings (0 to 1)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score (0 to 1)
 */
export function stringSimilarity(str1, str2) {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;
  
  console.log('Comparing strings:', str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  const distance = levenshteinDistance(str1, str2);
  const similarity = 1 - (distance / maxLength);
  
  console.log('Similarity score:', similarity);
  return similarity;
}

/**
 * Checks if two strings are similar enough to be considered a match
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @param {number} threshold - Similarity threshold (0 to 1)
 * @returns {boolean} - Whether the strings are similar enough
 */
export function isSimilar(str1, str2, threshold = 0.8) {
  return stringSimilarity(str1, str2) >= threshold;
}

/**
 * Calculates similarity between album titles, giving high scores for matching words
 * @param {string} title1 - First album title
 * @param {string} title2 - Second album title
 * @returns {number} - Similarity score (0 to 1)
 */
export function albumTitleSimilarity(title1, title2) {
  // Normalize the titles: lowercase and remove common words and parentheses
  const normalize = (str) => {
    return str
      .toLowerCase()
      .replace(/[\(\)]/g, '')
      .replace(/(original|motion picture|soundtrack|album|ost)/g, '')
      .trim()
      .split(/\s+/);
  };

  const words1 = normalize(title1);
  const words2 = normalize(title2);

  // Count matching words
  const matches = words1.filter(word => words2.includes(word)).length;
  
  // Calculate score based on matching words
  // If any word matches, score should be at least 0.7
  // More matching words increase the score
  if (matches > 0) {
    const maxLength = Math.max(words1.length, words2.length);
    return Math.max(0.7, matches / maxLength);
  }

  // If no words match, fall back to string similarity
  return stringSimilarity(title1, title2);
} 