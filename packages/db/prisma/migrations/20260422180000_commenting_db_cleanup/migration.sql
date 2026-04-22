-- Commenting final cleanup:
-- Drop only Commenting-specific tables and enums.
-- Keep shared channel-comment fields/types used by LeadRadar/core flows.

DROP TABLE IF EXISTS "CommentCandidate" CASCADE;
DROP TABLE IF EXISTS "CommentingUserState" CASCADE;
DROP TABLE IF EXISTS "CommentingChannelExclusion" CASCADE;
DROP TABLE IF EXISTS "CommentingChannelActivation" CASCADE;

DROP TYPE IF EXISTS "CommentCandidateStatus";
DROP TYPE IF EXISTS "CommentPublishSource";
