import type { LeadSourceRepository } from "../../infrastructure/repositories/lead-source-repository.js";

export class LeadSourceService {
  constructor(private readonly deps: { sourceRepo: LeadSourceRepository }) {}

  // TODO: list configured monitored sources/chats
  async listSources(_input: unknown): Promise<unknown> {
    // TODO
    return null;
  }

  // TODO: add a monitored source/chat
  async addSource(_input: unknown): Promise<unknown> {
    // TODO
    return null;
  }

  // TODO: update monitored source/chat
  async updateSource(_input: unknown): Promise<unknown> {
    // TODO
    return null;
  }

  // TODO: remove monitored source/chat
  async removeSource(_input: unknown): Promise<void> {
    // TODO
  }
}

