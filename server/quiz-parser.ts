// Markdown → structured quiz parser used by the Class Studio.
// Classes embed the parsed result as a JSON Svelte expression, so the
// generated component renders real interactive questions with zero runtime parsing.

export interface ParsedQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
}

export interface ParsedQuiz {
  title: string;
  questions: ParsedQuestion[];
}

/**
 * Parses a quiz written in a simple, forgiving markdown format:
 *
 *   ## Quiz title (optional)
 *
 *   **1.** What is 2 + 2?          ← question (or a plain "1." / "Q:" line)
 *   - 3                            ← options: -, *, +, or numbered 1./2./3.
 *   * 4
 *   + 5
 *
 *   ✅ * 4                         ← mark the correct one with ✅ / [x] / **
 *   > 2 + 2 = 4                    ← optional explanation
 *
 * The parser is line-oriented and tolerant: any list marker starts an
 * option; the correct marker line wins; a blockquote becomes explanation.
 */
export function parseQuizMarkdown(md: string): ParsedQuiz {
  const lines = String(md || "").split(/\r?\n/);
  const quiz: ParsedQuiz = { title: "", questions: [] };
  let current: ParsedQuestion | null = null;

  const isOption = (l: string) => /^\s*(?:[-*+]|✅\s*[-*+]?|\*\*)\s+/.test(l) || /^\s*✅\s*\d+[.)]\s+/.test(l);
  const isNumberedOption = (l: string) => /^\s*\d+[.)]\s+/.test(l);
  const isQuestion = (l: string) => /^\s*(?:#{1,4}\s+Q|^Q[:.)]|\*\*\d+\.\*\*|^\d+\.\s+\S)/.test(l) && !isNumberedOption(l);

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!quiz.title && /^#{1,3}\s+\S/.test(line) && !/^#{1,3}\s+Q/i.test(line)) {
      quiz.title = line.replace(/^#{1,3}\s+/, "").trim();
      continue;
    }

    if (isQuestion(line)) {
      current = {
        question: line
          .replace(/^#{1,4}\s+/, "")
          .replace(/^\*\*(\d+\.)\*\*\s*/, "$1 ")
          .replace(/^Q[:.)]\s*/i, "")
          .trim(),
        options: [],
        correctAnswerIndex: -1,
      };
      quiz.questions.push(current);
      continue;
    }

    if (!current) continue;

    if (isOption(line)) {
      const text = line
        .replace(/^\s*✅\s*/, "")
        .replace(/^\s*\*\*\s*/, "")
        .replace(/^\s*[-*+]\s+/, "")
        .replace(/^\s*\d+[.)]\s+/, "")
        .trim();
      if (line.includes("✅") || /^\s*\*\*\s/.test(line)) current.correctAnswerIndex = current.options.length;
      current.options.push(text);
      continue;
    }

    if (isNumberedOption(line)) {
      const text = line.replace(/^\s*\d+[.)]\s+/, "").trim();
      current.options.push(text);
      continue;
    }

    if (/^>\s*\S/.test(line) && current.options.length > 0) {
      current.explanation = line.replace(/^>\s*/, "").trim();
      continue;
    }
  }

  // Drop questions without at least two options; default the correct answer.
  quiz.questions = quiz.questions.filter(q => q.options.length >= 2).map(q => ({
    ...q,
    correctAnswerIndex: q.correctAnswerIndex >= 0 && q.correctAnswerIndex < q.options.length ? q.correctAnswerIndex : 0,
  }));
  return quiz;
}

/** True when the markdown yields a usable quiz. */
export function isParsableQuiz(md: string): boolean {
  return parseQuizMarkdown(md).questions.length > 0;
}
