import test from "node:test";
import assert from "node:assert/strict";
import { LeadRadarAuthorProfileCheckJobService } from "./lead-radar-author-profile-check-job-service.js";

const baseInput = {
  userId: "u1",
  telegramAccountId: "ta1",
  telegramUserId: "777",
  sourceChatId: "chat-1",
  sourceMessageId: "m1",
  username: "@smm_pro",
  displayName: "SMM Pro"
};

const matchedResult = {
  matched: true,
  score: 9,
  matchedKeywords: [{ keywordId: "k1", keyword: "smm", score: 9 }],
  reason: "Profile matched"
} as any;

const makeService = (params?: {
  dedupeSequence?: Array<any>;
  freshCache?: any | null;
  matchResult?: any;
  createLeadResult?: any;
  fetchedProfile?: any | null;
  fetchError?: Error | null;
}) => {
  const calls = {
    matcherInput: null as any,
    dedupeCalls: [] as any[],
    createLeadCalls: [] as any[],
    fetchCalls: [] as any[],
    upsertCalls: [] as any[]
  };
  const dedupeQueue = [...(params?.dedupeSequence ?? [])];

  const service = new LeadRadarAuthorProfileCheckJobService({
    dedupeService: {
      findExistingAuthorProfileLead: async (input: any) => {
        calls.dedupeCalls.push(input);
        return dedupeQueue.length > 0 ? dedupeQueue.shift() : null;
      }
    } as any,
    cacheRepo: {
      findFreshByTelegramUserId: async () => params?.freshCache ?? null,
      findAnyByTelegramUserId: async () => null,
      upsertProfileCache: async (input: any) => {
        calls.upsertCalls.push(input);
        return {
          id: "cache-1",
          telegram_account_id: input.telegram_account_id,
          telegram_user_id: input.telegram_user_id,
          username: input.username ?? null,
          display_name: input.display_name ?? null,
          bio: input.bio ?? null,
          linked_channel_id: input.linked_channel_id ?? null,
          linked_channel_username: input.linked_channel_username ?? null,
          linked_channel_title: input.linked_channel_title ?? null,
          linked_channel_description: input.linked_channel_description ?? null,
          raw_profile_json: input.raw_profile_json ?? null,
          fetched_at: input.fetched_at,
          expires_at: input.expires_at,
          created_at: new Date(),
          updated_at: new Date()
        };
      }
    },
    matcher: {
      match: async (input: any) => {
        calls.matcherInput = input;
        return (
          params?.matchResult ?? {
            matched: false,
            score: 0,
            matchedKeywords: [],
            reason: "none"
          }
        );
      }
    } as any,
    leadRepo: {
      createLead: async (input: any) => {
        calls.createLeadCalls.push(input);
        return params?.createLeadResult ?? { id: "lead-1" };
      }
    } as any,
    profileFetcher: {
      fetchProfile: async (input: any) => {
        calls.fetchCalls.push(input);
        if (params?.fetchError) throw params.fetchError;
        return params?.fetchedProfile ?? null;
      }
    },
    logger: {
      warn: () => {
        // noop for tests
      }
    }
  });

  return { service, calls };
};

test("job service does not create lead when no match", async () => {
  const { service, calls } = makeService({
    matchResult: { matched: false, score: 0, matchedKeywords: [], reason: "none" }
  });
  const out = await service.process(baseInput);
  assert.equal(out.matched, false);
  assert.equal(out.skippedReason, "no_match");
  assert.equal(calls.createLeadCalls.length, 0);
});

test("job service creates lead when matcher matched", async () => {
  const { service, calls } = makeService({
    matchResult: matchedResult
  });
  const out = await service.process(baseInput);
  assert.equal(out.matched, true);
  assert.equal(out.createdLeadId, "lead-1");
  assert.equal(calls.createLeadCalls.length, 1);
  assert.equal(calls.createLeadCalls[0].source_type, "author_profile");
});

test("job service skips when dedupe finds existing lead", async () => {
  const { service, calls } = makeService({
    dedupeSequence: [{ id: "existing" }]
  });
  const out = await service.process(baseInput);
  assert.equal(out.skippedReason, "existing_author_profile_lead");
  assert.equal(calls.createLeadCalls.length, 0);
});

test("job service does not create when no telegramUserId and no username", async () => {
  const { service, calls } = makeService({
    matchResult: matchedResult
  });
  const out = await service.process({
    ...baseInput,
    telegramUserId: null,
    username: "   "
  });
  assert.equal(out.skippedReason, "missing_author_identity");
  assert.equal(calls.createLeadCalls.length, 0);
});

test("repeated jobs for same author create at most one lead via dedupe", async () => {
  const dedupeState = { created: false };
  const createCalls: any[] = [];
  const service = new LeadRadarAuthorProfileCheckJobService({
    dedupeService: {
      findExistingAuthorProfileLead: async () => (dedupeState.created ? { id: "existing" } : null)
    } as any,
    cacheRepo: {
      findFreshByTelegramUserId: async () => null,
      findAnyByTelegramUserId: async () => null,
      upsertProfileCache: async () => {
        throw new Error("not used");
      }
    },
    matcher: {
      match: async () => matchedResult
    } as any,
    leadRepo: {
      createLead: async (input: any) => {
        createCalls.push(input);
        dedupeState.created = true;
        return { id: "lead-1" };
      }
    } as any
  });

  const first = await service.process(baseInput);
  const second = await service.process(baseInput);

  assert.equal(first.createdLeadId, "lead-1");
  assert.equal(second.skippedReason, "existing_author_profile_lead");
  assert.equal(createCalls.length, 1);
});

test("author_profile lead creation does not affect message/manual leads", async () => {
  const { service, calls } = makeService({
    matchResult: matchedResult
  });
  await service.process(baseInput);
  assert.equal(calls.createLeadCalls[0].source_type, "author_profile");
  assert.equal(calls.createLeadCalls[0].chat_id, "chat-1");
  assert.ok(String(calls.createLeadCalls[0].message_id).startsWith("author-profile:"));
});

test("uses fresh cache and does not call profile fetcher", async () => {
  const { service, calls } = makeService({
    freshCache: {
      telegram_user_id: "777",
      username: "cached_user",
      display_name: "Cached Name",
      bio: "cached bio",
      linked_channel_username: "cached_channel",
      linked_channel_title: "Cached Channel",
      linked_channel_description: "cached desc",
      raw_profile_json: { cached: true }
    },
    matchResult: matchedResult
  });

  const out = await service.process(baseInput);
  assert.equal(out.usedCache, true);
  assert.equal(calls.fetchCalls.length, 0);
  assert.equal(calls.matcherInput.bio, "cached bio");
});

test("fetches profile when cache missing and caches fetched profile", async () => {
  const { service, calls } = makeService({
    freshCache: null,
    fetchedProfile: {
      telegramUserId: "777",
      username: "enriched_user",
      displayName: "Enriched Name",
      bio: "enriched bio",
      linkedChannelUsername: "enriched_channel",
      linkedChannelTitle: "Enriched Channel",
      linkedChannelDescription: "enriched desc",
      rawProfileJson: { enriched: true }
    },
    matchResult: matchedResult
  });

  await service.process(baseInput);
  assert.equal(calls.fetchCalls.length, 1);
  assert.equal(calls.upsertCalls.length, 1);
  assert.equal(calls.upsertCalls[0]?.bio, "enriched bio");
  assert.equal(calls.matcherInput.bio, "enriched bio");
});

test("profile fetch failure falls back to payload fields and does not crash", async () => {
  const { service, calls } = makeService({
    freshCache: null,
    fetchError: new Error("TELEGRAM_LIMITED"),
    matchResult: matchedResult
  });

  const out = await service.process(baseInput);
  assert.equal(out.matched, true);
  assert.equal(calls.fetchCalls.length, 1);
  assert.equal(calls.upsertCalls.length, 0);
  assert.equal(calls.matcherInput.username, "@smm_pro");
  assert.equal(calls.matcherInput.displayName, "SMM Pro");
});

test("matcher receives enriched bio/channel fields after fetch", async () => {
  const { service, calls } = makeService({
    freshCache: null,
    fetchedProfile: {
      telegramUserId: "777",
      username: "user_from_worker",
      displayName: "Name From Worker",
      bio: "Bio From Worker",
      linkedChannelUsername: "channel_worker",
      linkedChannelTitle: "Worker Channel",
      linkedChannelDescription: "Worker channel about"
    },
    matchResult: matchedResult
  });

  await service.process(baseInput);
  assert.equal(calls.matcherInput.bio, "Bio From Worker");
  assert.equal(calls.matcherInput.linkedChannelTitle, "Worker Channel");
  assert.equal(calls.matcherInput.linkedChannelDescription, "Worker channel about");
});
