import { formatDistanceToNow } from "date-fns";

export const formatRelativeTime = (dateValue?: string | Date | null) => {
  if (!dateValue) {
    return "-";
  }

  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return formatDistanceToNow(date, { addSuffix: true });
};

export const formatDateTime = (dateValue?: string | Date | null) => {
  if (!dateValue) {
    return "-";
  }

  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
};
