export const MESSAGE_JOB_ATTEMPTS = 5;
export const MESSAGE_JOB_BACKOFF = { type: 'exponential' as const, delay: 1000 };
export const MESSAGE_JOB_REMOVE_ON_COMPLETE = 1000;
export const MESSAGE_JOB_REMOVE_ON_FAIL = 5000;