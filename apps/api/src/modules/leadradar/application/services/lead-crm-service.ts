import type { LeadRepository } from "../../infrastructure/repositories/lead-repository.js";

export class LeadCRMService {
  constructor(private readonly deps: { leadRepo: LeadRepository }) {}

  // TODO: list leads for mini-CRM UI
  async listLeads(_input: unknown): Promise<unknown> {
    // TODO
    return null;
  }

  // TODO: update lead status (manual CRM action)
  async updateLeadStatus(_input: unknown): Promise<unknown> {
    // TODO
    return null;
  }

  // TODO: update notes
  async updateLeadNotes(_input: unknown): Promise<unknown> {
    // TODO
    return null;
  }
}

