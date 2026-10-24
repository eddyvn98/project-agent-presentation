/** Deterministic ranking: preserves all enabled skills, without elevating skill text to authority. */
const stop = new Set(["the","and","for","with","from","about","this","that","have","your","please","hãy","giúp","với","cho","của","một","những","được","trong"]);
const terms = (value: string): string[] =>
  [...new Set((value.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    .filter(word => !stop.has(word)))].slice(0, 80);
export function rankTaskSkills<T extends { title: string; description?: string }>(skills: T[], request: string): T[] {
  if (!request.trim()) return [...skills];
  const q = new Set(terms(request));
  return skills.map((skill, index) => {
    const name = terms(skill.title), description = terms(skill.description ?? "");
    const score = name.reduce((sum, word) => sum + (q.has(word) ? 3 : 0), 0)
      + description.reduce((sum, word) => sum + (q.has(word) ? 1 : 0), 0);
    return { skill, index, score };
  }).sort((a,b) => b.score - a.score || a.index - b.index).map(item => item.skill);
}
