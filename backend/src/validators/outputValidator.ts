import type { CreditLine } from "../knowledgeBase/loadCreditLines.js";

const FORBIDDEN_PHRASES = [
  "aprovação garantida",
  "aprovado",
  "menor taxa",
  "taxa de",
  "está garantido",
  "será aprovado",
  "você conseguirá",
  "com certeza",
  "garantimos",
];

export interface ValidatedResponse {
  isValid: boolean;
  message: string;
  violations: string[];
}

export function validateOutput(response: string, creditLines: CreditLine[]): ValidatedResponse {
  const violations: string[] = [];
  const lowerResponse = response.toLowerCase();
  const validUrls = new Set(creditLines.map((line) => line.source.url));

  for (const phrase of FORBIDDEN_PHRASES) {
    if (lowerResponse.includes(phrase.toLowerCase())) {
      violations.push(`Contém frase proibida: "${phrase}"`);
    }
  }

  const urlPattern = /(https:\/\/[^\s)]+)/gi;
  const urlMatches = response.match(urlPattern) || [];
  for (const url of urlMatches) {
    if (!validUrls.has(url)) {
      violations.push(`URL fora da allow-list: ${url}`);
    }
  }

  return {
    isValid: violations.length === 0,
    message: response,
    violations,
  };
}

export function sanitizeForUser(response: string): string {
  return response;
}
