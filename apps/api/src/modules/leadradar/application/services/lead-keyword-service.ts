import type { LeadKeywordRepository } from "../../infrastructure/repositories/lead-keyword-repository.js";

export class LeadKeywordService {
  constructor(private readonly deps: { keywordRepo: LeadKeywordRepository }) {}

  // TODO: list keywords for a Telegram account
  async listKeywords(_input: unknown): Promise<unknown> {
    // TODO
    return null;
  }

  // TODO: add keyword rule
  async addKeyword(_input: unknown): Promise<unknown> {
    // TODO
    return null;
  }

  // TODO: update keyword rule
  async updateKeyword(_input: unknown): Promise<unknown> {
    // TODO
    return null;
  }

  // TODO: remove keyword rule
  async removeKeyword(_input: unknown): Promise<void> {
    // TODO
  }
}

