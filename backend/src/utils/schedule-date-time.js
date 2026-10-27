/* eslint-env node */

const getValidTimeZone = (timeZone) => {
  if (typeof timeZone !== 'string' || !timeZone.trim() || timeZone.length > 100) {
    return 'UTC';
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return 'UTC';
  }
};

export const formatScheduleDateTime = (date, timeZone) => {
  const scheduledDate = new Date(date);
  if (Number.isNaN(scheduledDate.getTime())) {
    throw new Error('The schedule contains an invalid production date and time.');
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: getValidTimeZone(timeZone),
    timeZoneName: 'short',
  }).format(scheduledDate);
};

export const getScheduleTimeZone = (timeZone) => getValidTimeZone(timeZone);
