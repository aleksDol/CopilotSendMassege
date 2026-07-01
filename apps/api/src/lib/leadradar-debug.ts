/** Opt-in LeadRadar trace logging (off unless ENABLE_LEADRADAR_DEBUG=1|true|yes|on). */
export const isLeadRadarDebugEnabled = (): boolean => {
  const v = String(process.env.ENABLE_LEADRADAR_DEBUG ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/** Trace one message when LEADRADAR_DEBUG_MESSAGE_ID matches, or all when debug flag is on. */
export const shouldTraceLeadRadarMessage = (messageId: string): boolean => {
  const exact = String(process.env.LEADRADAR_DEBUG_MESSAGE_ID ?? "").trim();
  if (exact && messageId && exact === messageId) return true;
  return isLeadRadarDebugEnabled();
};
