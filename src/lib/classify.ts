import type { WorkTag, TelegramPost } from "./types";

const IT_ROLE = [
  "software engineer",
  "software developer",
  "frontend developer",
  "backend developer",
  "full stack developer",
  "fullstack developer",
  "web developer",
  "mobile developer",
  "react developer",
  "next.js",
  "nextjs",
  "typescript",
  "node.js",
  "nodejs",
  "devops",
  "data engineer",
  "data scientist",
  "machine learning",
  "ml engineer",
  "ai engineer",
  "qa engineer",
  "cybersecurity",
  "security engineer",
  "ux designer",
  "ui designer",
  "product manager",
  "مبرمج",
  "مطور",
  "مهندس برمجيات",
  "امن سيبراني",
  "أمن سيبراني",
  "ذكاء اصطناعي",
  "فرونت اند",
  "باك اند",
  "فل ستاك",
  "ديفلوبر",
];

const IT_STACK = [
  "react",
  "vue",
  "angular",
  "python",
  "django",
  "laravel",
  "kotlin",
  "golang",
  "docker",
  "kubernetes",
  "aws",
  "azure",
  "figma",
  "javascript",
  "typescript",
  "تطوير ويب",
  "برمجة",
];

const JOB_KEYWORDS = [
  "hiring",
  "we are hiring",
  "vacancy",
  "vacancies",
  "job opening",
  "job opportunity",
  "career opportunity",
  "full-time",
  "full time",
  "part-time",
  "part time",
  "internship",
  "intern",
  "remote job",
  "apply now",
  "send cv",
  "send your cv",
  "join our team",
  "looking for",
  "وظيفة",
  "وظائف",
  "شاغر",
  "توظيف",
  "مطلوب",
  "راتب",
  "عن بعد",
  "تدريب",
  "متدرب",
  "سيرة ذاتية",
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function collect(haystack: string, keywords: string[]) {
  const matched: string[] = [];
  let hits = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) {
      matched.push(keyword);
      hits += keyword.split(" ").length > 1 ? 2 : 1;
    }
  }
  return { matched, hits };
}

export function classifyPost(text: string): {
  tag: WorkTag;
  score: number;
  matchedKeywords: string[];
} {
  const haystack = normalize(text);
  if (!haystack) {
    return { tag: "other", score: 0, matchedKeywords: [] };
  }

  const roles = collect(haystack, IT_ROLE);
  const stack = collect(haystack, IT_STACK);
  const jobs = collect(haystack, JOB_KEYWORDS);
  const matchedKeywords = [...new Set([...roles.matched, ...stack.matched, ...jobs.matched])].slice(0, 8);
  const score = roles.hits * 4 + stack.hits * 2 + jobs.hits * 3;

  let tag: WorkTag = "other";
  if (jobs.hits > 0 && (roles.hits > 0 || stack.hits > 0)) tag = "it-job";
  else if (roles.hits >= 2 && stack.hits > 0) tag = "it-job";
  else if (jobs.hits > 0) tag = "job";

  return { tag, score, matchedKeywords };
}

export function applyClassification(post: Omit<TelegramPost, "tag" | "score" | "matchedKeywords">): TelegramPost {
  const { tag, score, matchedKeywords } = classifyPost(post.text);
  return { ...post, tag, score, matchedKeywords };
}
